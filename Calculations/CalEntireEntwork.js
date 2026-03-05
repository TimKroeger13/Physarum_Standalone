// ============================================================
//  CalEntireEntwork.js  –  v4  (algorithm-safe memory fixes)
//
//  The Phase 1 per-user Dijkstra loop is 100% identical to the
//  original.  Only the three things that actually leaked memory
//  are changed:
//
//  FIX 1 – PRE-ALLOCATED TYPED-ARRAY BUFFERS
//    distU and segWeight were allocated fresh (new Float64Array)
//    on every outer iteration AND on every user inside that loop.
//    They are now allocated once before the outer loop and reset
//    with .fill() (a single fast memset, zero GC pressure).
//
//  FIX 2 – REUSABLE HEAP  (MinHeap.clear())
//    The heap was constructed fresh (new MinHeap) for every user
//    Dijkstra run.  The new MinHeap class keeps its internal
//    arrays alive between uses; clear() just resets the logical
//    size to 0.  No objects are created or freed per user run.
//
//  FIX 3 – THROTTLED MAP RENDERER
//    AddGeoJsonFeatureToMap_EntireNetwork was called on every
//    single outer iteration (up to 1000+ times).  Leaflet creates
//    DOM/canvas objects on every call.  Without explicit layer
//    cleanup these accumulate and fill the heap.
//    Now called every MAP_UPDATE_INTERVAL iterations (default 25)
//    and always on the final iteration.
//    The featureCollection wrapper is created once and reused so
//    the renderer always receives the same object reference,
//    making it easier for it to diff / replace rather than append.
//
//  Everything else (graph build, frontier logic, Phase 2 greedy
//  walk, Phase 3 finalisation, output format) is unchanged.
// ============================================================

// How often to push an update to the map renderer.
// Lower = more live feedback, higher = less memory pressure.
// 25 is a good default; raise to 50 if still tight on RAM.
const MAP_UPDATE_INTERVAL = 25;

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
        id:     i,
        data:   f,
        value:  f.properties.value,
        nodeId: -1
    }));

    if (sourceIsPoint) UserGeometryList.pop();

    for (const u of UserGeometryList) {
        u.nodeId = featureToNodeId(u.data, nodeIndex);
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
    const featureArray          = EntireNetwork.map(e => e.data);
    const liveFeatureCollection = turf.featureCollection(featureArray);

    // ── FIX 1 + 2: pre-allocate ALL reusable buffers once ──
    //    These are NEVER re-allocated inside any loop.
    //    .fill() to reset = one fast memset, zero allocations.

    const segWeight    = new Float64Array(numSegs);   // reset each outer iteration
    const distU        = new Float64Array(numNodes);  // reset each per-user Dijkstra
    const frontierDist = new Float64Array(numNodes).fill(Infinity);

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

        segWeight.fill(0);   // reset accumulated weights

        for (const user of UserGeometryList) {
            if (user.nodeId < 0) continue;
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
            for (const user of UserGeometryList) {
                if (user.nodeId === from || user.nodeId === to) {
                    FoundUsage = user; break;
                }
            }
            if (FoundUsage) Traversing = false;
        }

        if (!FoundUsage) FoundUsage = UserGeometryList[0];

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

        // Push new segments incrementally — no full .map() copy
        for (const step of CompletePath) {
            EntireNetwork.push(step);
            featureArray.push(step.data);  // featureArray === liveFeatureCollection.features
        }

        // O(1) swap-remove: swap found user with last element, then pop
        const removeIdx = UserGeometryList.indexOf(FoundUsage);
        const lastIdx   = UserGeometryList.length - 1;
        if (removeIdx !== lastIdx) UserGeometryList[removeIdx] = UserGeometryList[lastIdx];
        UserGeometryList.pop();

        // ── FIX 3: throttled map update ────────────────────
        //
        //  Leaflet creates DOM / canvas objects on every call to
        //  AddGeoJsonFeatureToMap_EntireNetwork.  Calling it 1000+
        //  times fills the heap with layer objects.
        //
        //  We update every MAP_UPDATE_INTERVAL iterations and always
        //  on the very last iteration.  liveFeatureCollection is the
        //  SAME object reference every call so Leaflet can replace
        //  rather than accumulate its internal layer data.
        if (calculationCounter % MAP_UPDATE_INTERVAL === 0 || UserGeometryList.length === 0) {
            await AddGeoJsonFeatureToMap_EntireNetwork(liveFeatureCollection);
            await new Promise(resolve => setTimeout(resolve, 0));  // yield to UI + GC
        }

        updateLoadingStatus(calculationCounter, calculationTotalLength);
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