// ============================================================
//  CalEntireEntwork.js  –  v5  (distance skip-guard)
//
//  All fixes from v4 are kept unchanged:
//    FIX 1 – pre-allocated typed-array buffers
//    FIX 2 – reusable MinHeap via clear()
//    FIX 3 – throttled map renderer
//
//  NEW – FIX 4: FRONTIER DISTANCE SKIP-GUARD
//    Before running a full Dijkstra for a user, we check the
//    straight-line distance from that user to every currently
//    reachable frontier node.  If the closest frontier node
//    is already farther than  value / heatCutoff  (= the
//    maximum distance at which this user could ever contribute
//    weight >= heatCutoff), the Dijkstra is skipped entirely.
//
//    Straight-line distance is always a lower bound on network
//    distance, so skipping is always safe — a house that is
//    geometrically too far away cannot possibly influence any
//    segment above the cutoff threshold.
//
//    The check uses a fast inline haversine (no turf, no object
//    allocation).  frontierCoords[] is maintained in parallel
//    with frontierDist[] and grows as extendFrontier() adds
//    newly reachable nodes.
// ============================================================

// How often to push an update to the map renderer.
// Lower = more live feedback, higher = less memory pressure.
// 25 is a good default; raise to 50 if still tight on RAM.
const MAP_UPDATE_INTERVAL = 1;

// ── binary min-heap – reuse via clear() ─────────────────────
class MinHeap {
    constructor() {
        this.P = [];       // priorities  (numbers, reused)
        this.N = [];       // node ids    (numbers, reused)
        this._size = 0;
    }

    get size() { return this._size; }

    // Reset logical size to 0.  Underlying arrays keep their
    // capacity so no GC churn when the heap is reused.
    clear() { this._size = 0; }

    push(priority, node) {
        const i = this._size;
        if (i < this.P.length) {
            this.P[i] = priority;
            this.N[i] = node;
        } else {
            this.P.push(priority);
            this.N.push(node);
        }
        this._size++;
        this._bubbleUp(i);
    }

    pop() {
        const p = this.P[0], n = this.N[0];
        const last = --this._size;
        if (last > 0) {
            this.P[0] = this.P[last];
            this.N[0] = this.N[last];
            this._sinkDown(0);
        }
        return { priority: p, node: n };
    }

    _bubbleUp(i) {
        const P = this.P, N = this.N;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (P[p] <= P[i]) break;
            let t = P[p]; P[p] = P[i]; P[i] = t;
            t = N[p]; N[p] = N[i]; N[i] = t;
            i = p;
        }
    }

    _sinkDown(i) {
        const P = this.P, N = this.N, n = this._size;
        while (true) {
            let s = i, l = 2*i+1, r = 2*i+2;
            if (l < n && P[l] < P[s]) s = l;
            if (r < n && P[r] < P[s]) s = r;
            if (s === i) break;
            let t = P[s]; P[s] = P[i]; P[i] = t;
            t = N[s]; N[s] = N[i]; N[i] = t;
            i = s;
        }
    }
}

// ── coordinate → string key (6 dp ≈ 0.11 m) ────────────────
const COORD_DP = 6;
function coordKey(c) {
    return c[0].toFixed(COORD_DP) + ',' + c[1].toFixed(COORD_DP);
}

// ── FIX 4: fast haversine distance in metres ────────────────
//  No turf call, no object allocation — just arithmetic.
function haversineDist(c1, c2) {
    const R  = 6371000;
    const φ1 = c1[1] * Math.PI / 180,  φ2 = c2[1] * Math.PI / 180;
    const Δφ = (c2[1] - c1[1]) * Math.PI / 180;
    const Δλ = (c2[0] - c1[0]) * Math.PI / 180;
    const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── build adjacency graph from segment list ──────────────────
function buildGraph(segmentList) {
    const nodeIndex = new Map();
    const nodes     = [];
    const adj       = [];

    function getNode(coord) {
        const k = coordKey(coord);
        if (!nodeIndex.has(k)) {
            const id = nodes.length;
            nodeIndex.set(k, id);
            nodes.push(coord);
            adj.push([]);
        }
        return nodeIndex.get(k);
    }

    const segNodes = segmentList.map((seg, segId) => {
        const coords    = seg.data.geometry.coordinates;
        const fromCoord = coords[0];
        const toCoord   = coords[coords.length - 1];
        const from      = getNode(fromCoord);
        const to        = getNode(toCoord);
        const len       = seg.length;
        adj[from].push({ segId, to,   length: len });
        adj[to  ].push({ segId, from: to, to: from, length: len });
        return { from, to };
    });

    return { nodeIndex, nodes, adj, segNodes };
}

// ── resolve a feature to its nearest graph node id ──────────
function featureToNodeId(feature, nodeIndex) {
    const geom = feature.geometry || feature.data?.geometry;
    let coord;
    if (geom.type === 'Point') {
        coord = geom.coordinates;
    } else {
        const cs = geom.coordinates;
        coord = cs[0];
        const k0 = coordKey(cs[0]);
        const k1 = coordKey(cs[cs.length - 1]);
        if (!nodeIndex.has(k0) && nodeIndex.has(k1)) coord = cs[cs.length - 1];
    }
    return nodeIndex.get(coordKey(coord)) ?? -1;
}

// ── Dijkstra (used only for initial frontier seeding) ────────
function dijkstra(sourceNodes, adj, numNodes, removedSegs) {
    const dist    = new Float64Array(numNodes).fill(Infinity);
    const prevSeg = new Int32Array(numNodes).fill(-1);
    const heap    = new MinHeap();

    for (const { nodeId, distSoFar } of sourceNodes) {
        if (nodeId < 0) continue;
        dist[nodeId] = distSoFar;
        heap.push(distSoFar, nodeId);
    }
    while (heap.size) {
        const { priority: d, node: u } = heap.pop();
        if (d > dist[u]) continue;
        for (const edge of adj[u]) {
            if (removedSegs && removedSegs.has(edge.segId)) continue;
            const nd = d + edge.length;
            if (nd < dist[edge.to]) {
                dist[edge.to]    = nd;
                prevSeg[edge.to] = edge.segId;
                heap.push(nd, edge.to);
            }
        }
    }
    return { dist, prevSeg };
}

// ════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════════════
async function calculateTheEntireNetwork(CompleteNetwork, SourceGeometry, UserGeometry) {

    const heatCutoff = (typeof window !== 'undefined' && window.heatCutoff != null)
        ? window.heatCutoff : 1;

    const sourceIsNetwork = SourceGeometry.features.some(f =>
        f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
    const sourceIsPoint = !sourceIsNetwork;

    // ── pre-compute segment lengths ────────────────────────
    const segmentList = CompleteNetwork.features.map((feat, i) => ({
        id:     i,
        data:   feat,
        length: turf.length(feat, { units: 'kilometers' }) * 1000
    }));
    const numSegs  = segmentList.length;

    // ── build graph ────────────────────────────────────────
    const { nodeIndex, nodes, adj, segNodes } = buildGraph(segmentList);
    const numNodes = nodes.length;

    // ── user points ────────────────────────────────────────
    let UserGeometryList = UserGeometry.features.map((f, i) => ({
        id:       i,
        data:     f,
        value:    f.properties.value,
        isForced: !!f.properties.forced,
        nodeId:   -1
    }));

    if (sourceIsPoint) UserGeometryList.pop();

    for (const u of UserGeometryList) {
        u.nodeId = featureToNodeId(u.data, nodeIndex);
    }

    // ── FIX 4: pre-compute maxDist per user ────────────────
    //  maxDist = value / heatCutoff = the furthest distance at
    //  which this user can ever contribute weight >= heatCutoff.
    //  Computed once here; used in the skip-guard below.
    for (const u of UserGeometryList) {
        u.maxDist = heatCutoff > 0 ? u.value / heatCutoff : Infinity;
    }

    // ── source seeds ───────────────────────────────────────
    let sourceNodeSeeds = [];
    let EntireNetwork   = [];
    let RunningLength   = 0;
    let RunningUsage    = 0;
    let RunningOrder    = 0;

    if (sourceIsNetwork) {
        for (const feat of SourceGeometry.features) {
            if (feat.geometry.type !== 'LineString' &&
                feat.geometry.type !== 'MultiLineString') continue;
            const len = turf.length(feat, { units: 'kilometers' }) * 1000;
            const cs  = feat.geometry.coordinates;
            for (const c of [cs[0], cs[cs.length - 1]]) {
                const nid = nodeIndex.get(coordKey(c));
                if (nid !== undefined) sourceNodeSeeds.push({ nodeId: nid, distSoFar: 0 });
            }
            EntireNetwork.push({
                id: -1 - EntireNetwork.length,
                data: feat, value: 0, length: len,
                PathLength: RunningLength, PathValue: 0,
                Order: RunningOrder, PathTotalProfit: 0
            });
            RunningLength += len;
            RunningOrder++;
        }
    } else {
        const srcNodeId = featureToNodeId(SourceGeometry.features[0], nodeIndex);
        sourceNodeSeeds = [{ nodeId: srcNodeId, distSoFar: 0 }];
    }

    // ── tracking sets ──────────────────────────────────────
    const builtSegIds   = new Set();
    const availableSegs = new Set(segmentList.map(s => s.id));

    // ── FIX 3: single featureCollection created once ───────
    //    featureArray is mutated in-place (push only) so the
    //    wrapper object always reflects the current state without
    //    a new allocation every iteration.
    const stableFeatureArray     = EntireNetwork.map(e => e.data);
    const stableCollection       = turf.featureCollection(stableFeatureArray);
    const currentBatchArray      = [];
    const currentBatchCollection = turf.featureCollection(currentBatchArray);

    // ── FIX 1 + 2: pre-allocate ALL reusable buffers once ──
    //    These are NEVER re-allocated inside any loop.
    //    .fill() to reset = one fast memset, zero allocations.

    const segWeight    = new Float64Array(numSegs);   // reset each outer iteration
    const distU        = new Float64Array(numNodes);  // reset each per-user Dijkstra
    const frontierDist = new Float64Array(numNodes).fill(Infinity);

    // ── FIX 4: frontier coordinate list ────────────────────
    //  Mirrors frontierDist — holds the [lng, lat] of every node
    //  that has become reachable from the source so far.
    //  Used by the skip-guard to compute straight-line distances
    //  without touching frontierDist (which stores network distances).
    const frontierCoords = [];
    for (const { nodeId } of sourceNodeSeeds) {
        if (nodeId >= 0) frontierCoords.push(nodes[nodeId]);
    }

    // One heap per logical role; clear() between uses
    const heapPhase1   = new MinHeap();   // reused for EVERY per-user Dijkstra in Phase 1
    const heapFrontier = new MinHeap();   // reused in extendFrontier

    // Seed frontierDist from source
    for (const { nodeId, distSoFar } of sourceNodeSeeds) {
        if (nodeId >= 0) frontierDist[nodeId] = distSoFar;
    }

    // ── extend frontierDist after adding a built segment ───
    function extendFrontier(segId) {
        const { from, to } = segNodes[segId];
        const len = segmentList[segId].length;

        heapFrontier.clear();   // O(1), no allocation

        const relax = (u, d) => {
            if (d < frontierDist[u]) {
                frontierDist[u] = d;
                heapFrontier.push(d, u);
            }
        };
        if (frontierDist[to]   < Infinity) relax(from, frontierDist[to]   + len);
        if (frontierDist[from] < Infinity) relax(to,   frontierDist[from] + len);

        while (heapFrontier.size) {
            const { priority: d, node: u } = heapFrontier.pop();
            if (d > frontierDist[u]) continue;
            for (const edge of adj[u]) {
                if (!builtSegIds.has(edge.segId) && edge.segId !== segId) continue;
                const nd = d + edge.length;
                if (nd < frontierDist[edge.to]) {
                    frontierDist[edge.to] = nd;
                    heapFrontier.push(nd, edge.to);
                }
            }
        }

        // ── FIX 4: record newly reachable node coordinates ─
        //  Any node that now has a finite frontierDist and was
        //  previously unreachable is added to frontierCoords so
        //  future skip-guard checks stay accurate.
        if (frontierDist[from] < Infinity) frontierCoords.push(nodes[from]);
        if (frontierDist[to]   < Infinity) frontierCoords.push(nodes[to]);
    }

    // Seed frontier for any pre-built source-network segments
    if (sourceIsNetwork) {
        for (const en of EntireNetwork) {
            const sId = CompleteNetwork.features.findIndex(f => f === en.data);
            if (sId >= 0) { builtSegIds.add(sId); availableSegs.delete(sId); }
        }
        for (const { nodeId, distSoFar } of sourceNodeSeeds) frontierDist[nodeId] = distSoFar;
        const heap2 = new MinHeap();
        sourceNodeSeeds.forEach(({ nodeId, distSoFar }) => heap2.push(distSoFar, nodeId));
        while (heap2.size) {
            const { priority: d, node: u } = heap2.pop();
            if (d > frontierDist[u]) continue;
            for (const edge of adj[u]) {
                if (!builtSegIds.has(edge.segId)) continue;
                const nd = d + edge.length;
                if (nd < frontierDist[edge.to]) {
                    frontierDist[edge.to] = nd;
                    heap2.push(nd, edge.to);
                }
            }
        }
    }

    const EntireUsage            = [];
    const calculationTotalLength = UserGeometryList.length;
    let   calculationCounter     = 0;

    // ════════════════════════════════════════════════════════
    //  OUTER LOOP – one iteration per user point to connect
    // ════════════════════════════════════════════════════════
    while (UserGeometryList.length > 0) {
        calculationCounter++;

        // Two-phase: while any forced user remains, only forced users vote.
        // Once all forced users are connected, all remaining users participate.
        const forcedRemaining = UserGeometryList.filter(u => u.isForced);
        const activeList = forcedRemaining.length > 0 ? forcedRemaining : UserGeometryList;

        // ── PHASE 1: accumulate segment weights ────────────
        //
        //  ALGORITHM UNCHANGED FROM ORIGINAL:
        //  For every remaining user, run a full Dijkstra from
        //  that user across all available + built segments.
        //  Each user's value/distance contribution is SUMMED
        //  onto segWeight[], so segments near many high-value
        //  users accumulate higher weights.
        //
        //  MEMORY FIX (FIX 1 + 2):
        //  • segWeight and distU are pre-allocated typed arrays;
        //    .fill() resets them without any heap allocation.
        //  • heapPhase1 is cleared with clear() (O(1), no GC).
        //    Its internal arrays grow to peak size on the first
        //    iteration and stay there — no per-user allocation.
        //
        //  SPEED FIX (FIX 4):
        //  • Before each Dijkstra, check the straight-line distance
        //    from this user to every frontier node.  Straight-line
        //    distance is always <= network distance, so if even the
        //    nearest frontier node is farther than maxDist, the full
        //    Dijkstra cannot produce any weight >= heatCutoff and is
        //    skipped entirely.

        segWeight.fill(0);   // reset accumulated weights

        let includedCount = 0;
        let skippedCount  = 0;

        for (const user of UserGeometryList) {
            if (user.nodeId < 0) continue;

            // ── FIX 4: skip-guard ───────────────────────────
            const uCoord = nodes[user.nodeId];
            let minToFrontier = Infinity;
            for (const fc of frontierCoords) {
                const d = haversineDist(uCoord, fc);
                if (d < minToFrontier) {
                    minToFrontier = d;
                    if (minToFrontier <= user.maxDist) break;
                }
            }
            if (minToFrontier > user.maxDist) { skippedCount++; continue; }
            // ── end skip-guard ──────────────────────────────

            includedCount++;
            const fixValue = user.value;

            // Reset distance buffer — same typed array every time
            distU.fill(Infinity);
            distU[user.nodeId] = 0;

            // Reset heap — O(1), reuses existing internal arrays
            heapPhase1.clear();
            heapPhase1.push(0, user.nodeId);

            while (heapPhase1.size) {
                const { priority: d, node: u } = heapPhase1.pop();
                if (d > distU[u]) continue;
                for (const edge of adj[u]) {
                    if (!availableSegs.has(edge.segId) && !builtSegIds.has(edge.segId)) continue;
                    const nd = d + edge.length;
                    if (nd < distU[edge.to]) {
                        distU[edge.to] = nd;
                        heapPhase1.push(nd, edge.to);
                    }
                }
            }

            // Accumulate this user's contribution onto every available segment
            for (const segId of availableSegs) {
                const { from, to } = segNodes[segId];
                const len    = segmentList[segId].length;
                const dFrom  = distU[from];
                const dTo    = distU[to];
                const dToSeg = Math.min(
                    dFrom < Infinity ? dFrom + len / 2 : Infinity,
                    dTo   < Infinity ? dTo   + len / 2 : Infinity
                );
                if (dToSeg === Infinity || dToSeg === 0) continue;
                const w = fixValue / dToSeg;
                if (w >= heatCutoff) segWeight[segId] += w;  // ← SUM, not replace
            }
        }

        // ── PHASE 2: greedy path expansion ─────────────────
        //  Unchanged from original.
        const CompletePath = [];
        let   FoundUsage   = null;

        let Traversing = true;
        while (Traversing) {
            let bestSegId  = -1;
            let bestWeight = -Infinity;

            for (const segId of availableSegs) {
                const { from, to } = segNodes[segId];
                if (frontierDist[from] === Infinity && frontierDist[to] === Infinity) continue;
                const w = segWeight[segId];
                if (w > bestWeight) { bestWeight = w; bestSegId = segId; }
            }

            // Fallback: nothing above cutoff — pick geographically closest
            if (bestSegId === -1) {
                let minDist = Infinity;
                for (const segId of availableSegs) {
                    const { from, to } = segNodes[segId];
                    const d = Math.min(frontierDist[from], frontierDist[to]);
                    if (d < minDist) { minDist = d; bestSegId = segId; }
                }
                if (bestSegId === -1) { Traversing = false; break; }
            }

            const seg = segmentList[bestSegId];
            RunningLength += seg.length;
            CompletePath.push({
                id:              seg.id,
                data:            seg.data,
                value:           bestWeight,
                length:          seg.length,
                PathLength:      RunningLength,
                PathValue:       RunningUsage,
                Order:           RunningOrder,
                PathTotalProfit: RunningUsage / RunningLength
            });
            RunningOrder++;

            availableSegs.delete(bestSegId);
            builtSegIds.add(bestSegId);
            extendFrontier(bestSegId);

            const { from, to } = segNodes[bestSegId];
            for (const user of activeList) {
                if (user.nodeId === from || user.nodeId === to) {
                    FoundUsage = user; break;
                }
            }
            if (FoundUsage) Traversing = false;
        }

        if (!FoundUsage) FoundUsage = activeList[0];

        // ── PATH CLEANUP: remove detour branches ──────────
        //
        //  The greedy expansion sometimes builds detours, e.g.
        //    A → A' → B → [backtrack] → A'' → User
        //  These segments aren't on the direct anchor→user path.
        //
        //  Strategy: build a mini-graph of just CompletePath's
        //  segments, run Dijkstra from the user node to the
        //  nearest "anchor" (any node already connected to the
        //  source through prior built segments), keep only those
        //  segments, restore the rest to availableSegs, then
        //  recompute frontierDist from scratch so phantom
        //  distances left by the removed segments don't corrupt
        //  future iterations.
        if (CompletePath.length > 1 && FoundUsage) {
            const userNid = FoundUsage.nodeId;

            // Anchor nodes = nodes reachable from source through
            // segments built in PRIOR iterations only.
            // = source seeds ∪ endpoints of (builtSegIds − currentPath)
            const currentPathIds = new Set();
            for (const s of CompletePath) currentPathIds.add(s.id);

            const anchorNodes = new Set();
            for (const { nodeId } of sourceNodeSeeds)
                if (nodeId >= 0) anchorNodes.add(nodeId);
            for (const segId of builtSegIds)
                if (!currentPathIds.has(segId)) {
                    anchorNodes.add(segNodes[segId].from);
                    anchorNodes.add(segNodes[segId].to);
                }

            // Mini-graph: adjacency list over CompletePath indices
            const miniAdj = new Map();
            for (let i = 0; i < CompletePath.length; i++) {
                const { from, to } = segNodes[CompletePath[i].id];
                const len = CompletePath[i].length;
                if (!miniAdj.has(from)) miniAdj.set(from, []);
                if (!miniAdj.has(to))   miniAdj.set(to,   []);
                miniAdj.get(from).push({ idx: i, other: to,   len });
                miniAdj.get(to)  .push({ idx: i, other: from, len });
            }

            // Dijkstra from user → nearest anchor (shortest by length)
            const miniDist = new Map([[userNid, 0]]);
            const miniPrev = new Map();          // nodeId → { segIdx, via }
            heapFrontier.clear();
            heapFrontier.push(0, userNid);
            let anchorReached = -1;

            dijkLoop: while (heapFrontier.size) {
                const { priority: d, node: u } = heapFrontier.pop();
                if (d > (miniDist.get(u) ?? Infinity)) continue;
                if (anchorNodes.has(u) && u !== userNid) {
                    anchorReached = u; break dijkLoop;
                }
                for (const { idx, other, len } of (miniAdj.get(u) || [])) {
                    const nd = d + len;
                    if (nd < (miniDist.get(other) ?? Infinity)) {
                        miniDist.set(other, nd);
                        miniPrev.set(other, { segIdx: idx, via: u });
                        heapFrontier.push(nd, other);
                    }
                }
            }

            if (anchorReached >= 0) {
                // Trace shortest path from anchor → user, collecting segIdx IN ORDER.
                // miniPrev walks anchor→user (each entry points toward the user side),
                // so orderedSegIdx comes out in the correct visual build order.
                const orderedSegIdx = [];
                let cur = anchorReached;
                while (miniPrev.has(cur)) {
                    const { segIdx, via } = miniPrev.get(cur);
                    orderedSegIdx.push(segIdx);
                    cur = via;
                }
                const keptIdx = new Set(orderedSegIdx);

                if (keptIdx.size < CompletePath.length) {
                    // Remove detour segments from built state
                    for (let i = 0; i < CompletePath.length; i++) {
                        if (!keptIdx.has(i)) {
                            builtSegIds.delete(CompletePath[i].id);
                            availableSegs.add(CompletePath[i].id);
                            RunningLength -= CompletePath[i].length;
                            RunningOrder--;
                        }
                    }

                    // Rebuild CompletePath in network order (anchor → user)
                    const reordered = orderedSegIdx.map(idx => CompletePath[idx]);
                    CompletePath.length = 0;
                    for (const s of reordered) CompletePath.push(s);

                    // Rewrite cumulative PathLength for remaining segments
                    let cumLen = RunningLength;
                    for (const s of CompletePath) cumLen -= s.length;
                    for (const s of CompletePath) { cumLen += s.length; s.PathLength = cumLen; }

                    // Recompute frontierDist + frontierCoords from scratch.
                    // extendFrontier set finite distances on the removed nodes;
                    // those phantom values would corrupt future segment selection.
                    frontierDist.fill(Infinity);
                    heapFrontier.clear();
                    for (const { nodeId, distSoFar } of sourceNodeSeeds) {
                        if (nodeId >= 0) {
                            frontierDist[nodeId] = distSoFar;
                            heapFrontier.push(distSoFar, nodeId);
                        }
                    }
                    while (heapFrontier.size) {
                        const { priority: d, node: u } = heapFrontier.pop();
                        if (d > frontierDist[u]) continue;
                        for (const edge of adj[u]) {
                            if (!builtSegIds.has(edge.segId)) continue;
                            const nd = d + edge.length;
                            if (nd < frontierDist[edge.to]) {
                                frontierDist[edge.to] = nd;
                                heapFrontier.push(nd, edge.to);
                            }
                        }
                    }
                    frontierCoords.length = 0;
                    for (let ni = 0; ni < numNodes; ni++)
                        if (frontierDist[ni] < Infinity) frontierCoords.push(nodes[ni]);
                }
            }
        }
        // ── end path cleanup ───────────────────────────────

        // ── PHASE 3: finalise ──────────────────────────────
        RunningUsage += FoundUsage.value;
        EntireUsage.push({
            data:      FoundUsage.data,
            id:        FoundUsage.id,
            length:    FoundUsage.length || 0,
            value:     FoundUsage.value,
            occurence: RunningOrder
        });

        if (CompletePath.length > 0) {
            const last = CompletePath[CompletePath.length - 1];
            last.PathValue       = RunningUsage;
            last.PathTotalProfit = RunningUsage / RunningLength;
        }

        // Push new segments — stable gets previous iterations, current batch gets this one
        currentBatchArray.length = 0;  // clear previous iteration's batch
        for (const step of CompletePath) {
            EntireNetwork.push(step);
            currentBatchArray.push(step.data);  // red layer for this iteration
        }

        // O(1) swap-remove: swap found user with last element, then pop
        const removeIdx = UserGeometryList.indexOf(FoundUsage);
        const lastIdx   = UserGeometryList.length - 1;
        if (removeIdx !== lastIdx) UserGeometryList[removeIdx] = UserGeometryList[lastIdx];
        UserGeometryList.pop();

        // ── FIX 3: map update — stable green + current batch red ──
        const isFinal = UserGeometryList.length === 0;

        if (calculationCounter % MAP_UPDATE_INTERVAL === 0 || isFinal) {
            if (isFinal) {
                // Fold current batch into stable and render everything green
                for (const f of currentBatchArray) stableFeatureArray.push(f);
                currentBatchArray.length = 0;
                await AddGeoJsonFeatureToMap_EntireNetwork(stableCollection);
                await ClearCurrentConnection();
            } else {
                // Render stable as green, current iteration's batch as red
                await AddGeoJsonFeatureToMap_EntireNetwork(stableCollection);
                await AddGeoJsonFeatureToMap_CurrentConnection(currentBatchCollection);
                // Fold current batch into stable now that it's been displayed
                for (const f of currentBatchArray) stableFeatureArray.push(f);
                currentBatchArray.length = 0;
            }
        }

        // Yield to the browser event loop on every iteration.
        await new Promise(resolve => setTimeout(resolve, 0));

        updateLoadingStatus(calculationCounter, calculationTotalLength, includedCount, skippedCount);
    }

    return [EntireNetwork, EntireUsage];
}

// ── kept for compatibility with CalCompleteNetwork.js ────────
function checkIntersectionWithTolerance(geom1, geom2, tolerance) {
    const coords1 = geom1.geometry.type === 'Point'
        ? [geom1.geometry.coordinates] : geom1.geometry.coordinates;
    const coords2 = geom2.geometry.type === 'Point'
        ? [geom2.geometry.coordinates] : geom2.geometry.coordinates;
    for (let i = 0; i < coords1.length; i++) {
        for (let j = 0; j < coords2.length; j++) {
            const distance = turf.distance(
                turf.point(coords1[i]),
                turf.point(coords2[j]),
                { units: 'kilometers' }
            ) * 1000;
            if (distance <= tolerance) return true;
        }
    }
    return false;
}