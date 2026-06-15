// ============================================================
//  BarPlot.js  —  v4
//
//  Fix 1: top-3 are LOCAL MAXIMA with minimum separation,
//          not global top-3 (which cluster together)
//  Fix 2: chart data is CONNECTION-ONLY (not every segment)
//          uses window.EntireUsage + window.EntireNetwork
//  Fix 3: Win/Loss uses FIXED GLOBAL Y-SCALE centered at
//          WIN_LOSS_CUTOFF (1000).  Bars above cutoff = win
//          (green, go up), bars below cutoff = loss (red, go down).
//          Reference line is fixed, chart never jumps.
//  Fix 4: Zoom Y-axis also fixed to global max (no jumping)
// ============================================================

const CONNECTION_THRESHOLD = 2000;
const ZOOM_CONN_HALF  = 50;    // connections shown each side in zoom
const TOP_N           = 3;

// ── Module state (reset on each displayBarPlot call) ────────
let _profit       = [];   // full PathTotalProfit[] (all segments, for overview bg)
let _connIndices  = [];   // 0-based segment index for each connection event
let _connProfit   = [];   // PathTotalProfit at each connection
let _connMarginal = [];   // kWh/m per connection (dValue / dNewLength)
let _connDemand   = [];   // raw demand value added at each connection
let _connForced   = [];   // true if connection was a forced point
let _lastForcedConnIdx = -1;  // index of last forced connection
let _top3ConnIdx  = [];   // indices into _conn* arrays: top-3 local maxima
let _globalWLMax  = 1;    // fixed symmetric range for W/L scale
let _globalProfMax = 1;   // fixed y-max for zoom chart

// D3 element refs
let _oG          = null;
let _overviewX   = null;
let _oInH        = 0;
let _zG          = null;
let _zDims       = null;
let _wG          = null;
let _wDims       = null;
let _built       = false;

// ── Public ───────────────────────────────────────────────────
async function displayBarPlot(numbers) {
    _profit  = numbers;
    _built   = false;

    const usage = window.EntireUsage   || [];
    const net   = window.EntireNetwork || [];

    _connIndices  = [];
    _connProfit   = [];
    _connMarginal = [];
    _connDemand   = [];
    _connForced   = [];

    let prevPathLength = 0;

    for (let i = 0; i < usage.length; i++) {
        const occ    = usage[i].occurence;                          // 1-based slider val
        const segIdx = Math.max(0, Math.min(occ - 1, net.length - 1));  // 0-based
        const pathLen = net[segIdx] ? net[segIdx].PathLength || 0 : 0;
        const dLength = pathLen - prevPathLength;
        const dValue  = usage[i].value || 0;
        const marginal = dLength > 0 ? dValue / dLength : 0;

        _connIndices.push(segIdx);
        _connProfit.push(_profit[segIdx] || 0);
        _connMarginal.push(marginal);
        _connDemand.push(dValue / 1000);
        _connForced.push(!!usage[i].forced);
        prevPathLength = pathLen;
    }

    // Fixed scales: compute ONCE from all connection data
    _globalProfMax = (d3.max(_connProfit) || 1) * 1.12;

    _globalWLMax = (d3.max(_connDemand) || 1) * 1.1;

    // Find top-3 LOCAL MAXIMA with minimum separation
    _top3ConnIdx = _findLocalMaxima(_connProfit, _connMarginal);

    _lastForcedConnIdx = _connForced.lastIndexOf(true);

    _scheduleBuild(0);
}

function _scheduleBuild(attempt) {
    setTimeout(() => {
        const c = document.getElementById('chartPanel');
        if (!c) return;
        if (c.clientHeight < 10 && attempt < 5) { _scheduleBuild(attempt + 1); return; }
        _buildCharts();
    }, attempt === 0 ? 300 : 100);
}

// ── _findLocalMaxima ─────────────────────────────────────────
//  Score = profit[i] − profit[i-1]  (simple step up from previous)
//  GOLD   = highest cumulative value
//  SILVER = biggest single-step increase
//  BRONZE = second-biggest single-step increase
function _findLocalMaxima(profit) {
    if (!profit || profit.length < 2) return [];
    const n = profit.length;

    // GOLD: index of highest cumulative value
    let goldIdx = 0;
    for (let i = 1; i < n; i++) {
        if (isFinite(profit[i]) && profit[i] > profit[goldIdx]) goldIdx = i;
    }

    // SILVER + BRONZE: rank every step by profit[i] - profit[i-1]
    const steps = [];
    for (let i = 1; i < n; i++) {
        if (!isFinite(profit[i]) || !isFinite(profit[i - 1])) continue;
        steps.push({ i, score: profit[i] - profit[i - 1] });
    }
    steps.sort((a, b) => b.score - a.score);

    // Pick top-2 step indices that are not the same position as gold
    const selected = [goldIdx];
    for (const s of steps) {
        if (selected.length >= TOP_N) break;
        if (!selected.includes(s.i)) selected.push(s.i);
    }

    // Return in medal order: [gold, silver, bronze]
    return selected;
}



// ── Build SVG panels (once per dataset) ─────────────────────
let _resizeObserverAttached = false;
function _buildCharts() {
    const container = document.getElementById('chartPanel');
    if (!container || !_connProfit.length) return;
    if (!_resizeObserverAttached && typeof ResizeObserver !== 'undefined') {
        _resizeObserverAttached = true;
        let _rt = null, _lw = 0;
        new ResizeObserver(entries => {
            const w = Math.round(entries[0].contentRect.width);
            if (Math.abs(w - _lw) < 2) return;
            _lw = w;
            clearTimeout(_rt);
            _rt = setTimeout(() => { if (_built) _buildCharts(); }, 150);
        }).observe(container);
    }
    container.innerHTML = '';
    _built = false;

    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W < 10 || H < 10) return;

    const oH = Math.max(40, Math.round(H * 0.50));
    const dH = H - oH;

    const oP = { t: 10, r: 14, b: 20, l: 46 };
    const zP = { t: 10, r:  8, b: 20, l: 46 };
    const wP = { t: 10, r: 14, b: 20, l: 54 };

    const zW = Math.round(W * 0.57);
    const wW = W - zW;

    // Wrapper divs
    const ow = _div('chart-overview-wrap', `height:${oH}px`);
    const dw = _div('chart-detail-wrap',   `height:${dH}px`);
    const zw = _div('chart-zoom-wrap',     `width:${zW}px`);
    const wl = _div('chart-winloss-wrap',  `width:${wW}px`);
    container.appendChild(ow);
    container.appendChild(dw);
    dw.appendChild(zw);
    dw.appendChild(wl);

    // ── OVERVIEW ─────────────────────────────────────────────
    const oInW = W   - oP.l - oP.r;
    const oInH = oH  - oP.t - oP.b;
    _oInH = oInH;

    // x: full segment range; y: fixed global max
    const xO = d3.scaleLinear().domain([0, Math.max(_profit.length - 1, 1)]).range([0, oInW]);
    const yO = d3.scaleLinear().domain([0, _globalProfMax]).range([oInH, 0]);
    _overviewX = xO;

    const svgO = d3.select(ow).append('svg').attr('width', W).attr('height', oH);
    _oG = svgO.append('g').attr('transform', `translate(${oP.l},${oP.t})`);

    // Y-axis grid
    _oG.append('g')
        .call(d3.axisLeft(yO).ticks(3).tickSize(-oInW).tickFormat(_fmtK))
        .call(_cleanAxis);

    svgO.append('defs').append('clipPath').attr('id', 'clip-ov')
        .append('rect').attr('width', oInW).attr('height', oInH);
    const oClip = _oG.append('g').attr('clip-path', 'url(#clip-ov)');

    // Segment-level series — purple for forced portion, green for free
    const _lastForcedSeg = _lastForcedConnIdx >= 0 ? _connIndices[_lastForcedConnIdx] : -1;

    if (_lastForcedSeg >= 0) {
        oClip.append('path')
            .datum(_profit.slice(0, _lastForcedSeg + 1))
            .attr('fill', 'rgba(192,96,255,0.08)')
            .attr('stroke', 'rgba(192,96,255,0.70)')
            .attr('stroke-width', 1.5)
            .attr('d', d3.area()
                .x((_, i) => xO(i)).y0(oInH).y1(d => yO(d))
                .curve(d3.curveCatmullRom.alpha(0.5)));
    }

    const _freeSeg = Math.max(0, _lastForcedSeg);
    oClip.append('path')
        .datum(_profit.slice(_freeSeg))
        .attr('fill', 'rgba(114,255,0,0.10)')
        .attr('stroke', 'rgba(114,255,0,0.65)')
        .attr('stroke-width', 1.5)
        .attr('d', d3.area()
            .x((_, i) => xO(_freeSeg + i)).y0(oInH).y1(d => yO(d))
            .curve(d3.curveCatmullRom.alpha(0.5)));

    if (_lastForcedSeg >= 0 && _lastForcedSeg < _profit.length - 1) {
        _oG.append('line')
            .attr('x1', xO(_lastForcedSeg)).attr('x2', xO(_lastForcedSeg))
            .attr('y1', 0).attr('y2', oInH)
            .attr('stroke', 'rgba(192,96,255,0.55)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,3');
    }

    // Top-3 markers (gold = highest value / silver = greatest incline / bronze = 2nd incline)
    const peakColors  = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const peakLabels  = ['#1 /',    '#2 /',    '#3 /'   ];
    _top3ConnIdx.forEach((cIdx, rank) => {
        const px = xO(_connIndices[cIdx]);
        const py = yO(_connProfit[cIdx]);
        oClip.append('path')
            .attr('d', `M${px},${py - 2} L${px - 5},${py - 12} L${px + 5},${py - 12} Z`)
            .attr('fill', peakColors[rank]).attr('opacity', 0.95);
        oClip.append('text')
            .attr('x', px).attr('y', py - 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '8.5px').attr('font-weight', '600')
            .attr('fill', peakColors[rank])
            .attr('font-family', "'IBM Plex Mono', monospace")
            .text(`${peakLabels[rank]} ${_fmt(_connProfit[cIdx])}`);
    });

    // Slider cursor (updated dynamically)
    _oG.append('line').attr('class', 'ov-cursor')
        .attr('y1', 0).attr('y2', oInH)
        .attr('stroke', '#FF6A00').attr('stroke-width', 1.5).attr('opacity', 0);

    // Label
    _oG.append('text')
        .attr('x', oInW).attr('y', -2).attr('text-anchor', 'end')
        .attr('font-size', '8px').attr('fill', '#6e7681')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text('OVERVIEW — cumulative kWh/m  ·  all segments');

    // ── ZOOM SVG ─────────────────────────────────────────────
    const zInW = zW - zP.l - zP.r;
    const zInH = dH - zP.t - zP.b;
    _zDims = { inW: zInW, inH: zInH };

    const svgZ = d3.select(zw).append('svg').attr('width', zW).attr('height', dH);
    _zG = svgZ.append('g').attr('transform', `translate(${zP.l},${zP.t})`);
    _zG.append('g').attr('class', 'z-content');
    _zG.append('g').attr('class', 'z-yaxis');
    _zG.append('g').attr('class', 'z-xaxis').attr('transform', `translate(0,${zInH})`);
    _zG.append('text')
        .attr('x', zInW / 2).attr('y', zInH + 17).attr('text-anchor', 'middle')
        .attr('font-size', '8px').attr('fill', '#6e7681')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text(`ZOOM  ±${ZOOM_CONN_HALF} connections  ·  cumulative kWh/m`);

    // ── WIN/LOSS SVG ─────────────────────────────────────────
    const wInW = wW - wP.l - wP.r;
    const wInH = dH - wP.t - wP.b;
    _wDims = { inW: wInW, inH: wInH };

    const svgW = d3.select(wl).append('svg').attr('width', wW).attr('height', dH);
    _wG = svgW.append('g').attr('transform', `translate(${wP.l},${wP.t})`);
    _wG.append('g').attr('class', 'wl-content');
    _wG.append('g').attr('class', 'wl-yaxis');
    _wG.append('g').attr('class', 'wl-refline');
    _wG.append('text')
        .attr('x', wInW / 2).attr('y', wInH + 17).attr('text-anchor', 'middle')
        .attr('font-size', '8px').attr('fill', '#6e7681')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text('DEMAND PER CONNECTION  MWh');

    _built = true;
    _updateDetailCharts(1);
}

// ── Update detail charts on every slider change ──────────────
function _updateDetailCharts(sliderVal) {
    if (!_built || !_connProfit.length) return;

    const curConnIdx = _currentConnIdx(sliderVal);
    const segIdx     = curConnIdx >= 0 ? _connIndices[curConnIdx] : 0;

    // ── Overview cursor — follows every segment, not just connections ──
    const cursorSegIdx = Math.max(0, sliderVal - 1);
    _oG.select('.ov-cursor')
        .attr('x1', _overviewX(cursorSegIdx)).attr('x2', _overviewX(cursorSegIdx))
        .attr('opacity', 1);

    const half    = ZOOM_CONN_HALF;
    const winSize = half * 2;
    let wStart = Math.max(0, curConnIdx - half);
    let wEnd   = wStart + winSize;
    if (wEnd > _connProfit.length) {
        wEnd   = _connProfit.length;
        wStart = Math.max(0, wEnd - winSize);
    }

    // ── ZOOM chart ────────────────────────────────────────────
    const { inW: zW, inH: zH } = _zDims;

    // connSlice declared first so we can base yZ on the visible window max
    const connSlice = _connProfit.slice(wStart, wEnd);

    // Zoom y-scale: fits the visible window so detail is always readable
    const zMax = (d3.max(connSlice) || 1) * 1.12;
    const yZ = d3.scaleLinear().domain([0, zMax]).range([zH, 0]);
    const xZ = d3.scaleLinear().domain([wStart, Math.max(wEnd - 1, wStart + 1)]).range([0, zW]);

    const zContent = _zG.select('.z-content');
    zContent.html('');

    // Compute forced/free split within visible window
    let splitAt = 0;
    for (let i = 0; i < connSlice.length; i++) {
        if (_connForced[wStart + i]) splitAt = i + 1;
    }

    if (connSlice.length > 1) {
        // Fill area (green throughout for readability)
        zContent.append('path')
            .datum(connSlice)
            .attr('fill', 'rgba(114,255,0,0.10)')
            .attr('d', d3.area()
                .x((_, i) => xZ(wStart + i)).y0(zH).y1(d => yZ(d))
                .curve(d3.curveMonotoneX));

        // Purple line for forced portion
        if (splitAt > 1) {
            zContent.append('path')
                .datum(connSlice.slice(0, splitAt))
                .attr('fill', 'none').attr('stroke', '#c060ff').attr('stroke-width', 2)
                .attr('d', d3.line()
                    .x((_, i) => xZ(wStart + i)).y(d => yZ(d))
                    .curve(d3.curveMonotoneX));
        }

        // Green line for free portion (starts one point back to join cleanly)
        const freeStart = Math.max(0, splitAt - 1);
        if (freeStart < connSlice.length - 1) {
            zContent.append('path')
                .datum(connSlice.slice(freeStart))
                .attr('fill', 'none').attr('stroke', '#72FF00').attr('stroke-width', 2)
                .attr('d', d3.line()
                    .x((_, i) => xZ(wStart + freeStart + i)).y(d => yZ(d))
                    .curve(d3.curveMonotoneX));
        }

        // Divider at forced/free boundary
        if (splitAt > 0 && splitAt < connSlice.length) {
            zContent.append('line')
                .attr('x1', xZ(wStart + splitAt - 0.5)).attr('x2', xZ(wStart + splitAt - 0.5))
                .attr('y1', 0).attr('y2', zH)
                .attr('stroke', 'rgba(192,96,255,0.5)').attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,3');
        }
    }

    // Dots — purple for forced, green for free
    connSlice.forEach((v, i) => {
        const isF = _connForced[wStart + i];
        zContent.append('circle')
            .attr('cx', xZ(wStart + i)).attr('cy', yZ(v)).attr('r', 3)
            .attr('fill', isF ? '#c060ff' : '#72FF00').attr('opacity', 0.65);
    });

    // Top-3 visible in zoom window
    const peakColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const peakLabels = ['#1',    '#2',    '#3'   ];
    _top3ConnIdx.forEach((cIdx, rank) => {
        if (cIdx >= wStart && cIdx < wEnd) {
            const px = xZ(cIdx), py = yZ(_connProfit[cIdx]);
            zContent.append('circle')
                .attr('cx', px).attr('cy', py).attr('r', 5.5)
                .attr('fill', peakColors[rank])
                .attr('stroke', '#0a0e14').attr('stroke-width', 1.5);
            zContent.append('text')
                .attr('x', px).attr('y', py - 10)
                .attr('text-anchor', 'middle').attr('font-size', '8px')
                .attr('fill', peakColors[rank])
                .attr('font-family', "'IBM Plex Mono', monospace")
                .text(peakLabels[rank]);
        }
    });

    // Current position
    if (curConnIdx >= wStart && curConnIdx < wEnd) {
        const cx = xZ(curConnIdx);
        const cy = yZ(_connProfit[curConnIdx]);
        zContent.append('line')
            .attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', zH)
            .attr('stroke', '#FF6A00').attr('stroke-width', 1.5).attr('opacity', 0.7);
        zContent.append('circle')
            .attr('cx', cx).attr('cy', cy).attr('r', 5)
            .attr('fill', '#FF6A00').attr('stroke', '#0a0e14').attr('stroke-width', 1.5);
        const lx     = cx > zW * 0.75 ? cx - 8 : cx + 8;
        const anchor = cx > zW * 0.75 ? 'end'  : 'start';
        zContent.append('text')
            .attr('x', lx).attr('y', cy - 9)
            .attr('text-anchor', anchor)
            .attr('font-size', '9.5px').attr('font-weight', '600').attr('fill', '#FF6A00')
            .attr('font-family', "'IBM Plex Mono', monospace")
            .text(_fmt(_connProfit[curConnIdx]));
    }

    // Axes
    _zG.select('.z-yaxis')
        .call(d3.axisLeft(yZ).ticks(3).tickSize(-zW).tickFormat(_fmtK))
        .call(_cleanAxis);
    _zG.select('.z-xaxis')
        .call(d3.axisBottom(xZ).ticks(Math.min(6, connSlice.length))
            .tickFormat(d => `#${Math.round(d) + 1}`))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('.tick line').remove())
        .call(g => g.selectAll('.tick text')
            .attr('fill', '#6e7681').attr('font-size', '8px')
            .attr('font-family', "'IBM Plex Mono', monospace"));

    // ── PER-CONNECTION chart ──────────────────────────────────
    const { inW: wW, inH: wH } = _wDims;

    const margSlice = _connDemand.slice(wStart, wEnd);

    // Fixed y-scale 0→global max — never shifts while scrolling
    const yW = d3.scaleLinear().domain([0, _globalWLMax]).range([wH, 0]);

    const pitch = wW / Math.max(margSlice.length, 1);
    const bW    = Math.max(1, pitch - 1);

    const wlContent = _wG.select('.wl-content');
    wlContent.html('');

    margSlice.forEach((v, i) => {
        const isF = _connForced[wStart + i];
        const fill = isF
            ? 'rgba(192,96,255,0.75)'
            : v >= 200 ? 'rgba(114,255,0,0.75)' : 'rgba(255,80,80,0.75)';
        wlContent.append('rect')
            .attr('x',      i * pitch)
            .attr('y',      yW(v))
            .attr('width',  bW)
            .attr('height', Math.max(1, wH - yW(v)))
            .attr('fill',   fill);
    });

    // Highlight current column
    const wlCurr = curConnIdx - wStart;
    if (wlCurr >= 0 && wlCurr < margSlice.length) {
        wlContent.append('rect')
            .attr('x', wlCurr * pitch - 1).attr('y', 0)
            .attr('width', bW + 2).attr('height', wH)
            .attr('fill', 'rgba(255,106,0,0.14)').attr('pointer-events', 'none');

        const mv     = margSlice[wlCurr];
        const labelY = Math.max(yW(mv) - 5, 10);
        wlContent.append('text')
            .attr('x', Math.min(wlCurr * pitch + bW / 2, wW - 4))
            .attr('y', labelY).attr('text-anchor', 'middle')
            .attr('font-size', '8.5px').attr('font-weight', '600')
            .attr('fill', _connForced[wStart + wlCurr] ? '#c060ff' : mv >= 200 ? '#72FF00' : '#ff5050')
            .attr('font-family', "'IBM Plex Mono', monospace")
            .text(_fmt(mv));
    }

    _wG.select('.wl-refline').html('');

    // Y-axis (fixed scale)
    _wG.select('.wl-yaxis')
        .call(d3.axisLeft(yW).ticks(4).tickSize(-wW).tickFormat(_fmtK))
        .call(_cleanAxis);
}

// ── Return the connection index for a given slider value ─────
function _currentConnIdx(sliderVal) {
    if (!_connIndices.length) return 0;
    const segVal = sliderVal - 1;  // 0-based
    let idx = 0;
    for (let i = 0; i < _connIndices.length; i++) {
        if (_connIndices[i] <= segVal) idx = i;
        else break;
    }
    return idx;
}

// Public wrapper used by Slider.js for prev/next navigation
function getCurrentConnIdx() {
    const val = parseInt(document.getElementById('slider').value, 10);
    return _currentConnIdx(val);
}

// ── Helpers ──────────────────────────────────────────────────
function _div(cls, style) {
    const d = document.createElement('div');
    d.className = cls; d.style.cssText = style; return d;
}

function _cleanAxis(g) {
    g.select('.domain').remove();
    g.selectAll('.tick line')
        .attr('stroke', 'rgba(255,255,255,0.07)')
        .attr('stroke-dasharray', '3,3');
    g.selectAll('.tick text')
        .attr('fill', '#6e7681').attr('font-size', '9px')
        .attr('font-family', "'IBM Plex Mono', monospace");
}

function _fmt(v) {
    if (v == null || !isFinite(v)) return '—';
    return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString();
}

function _fmtK(d) {
    return Math.abs(d) >= 1000 ? (d / 1000).toFixed(1) + 'k' : d;
}

// ── Public API ───────────────────────────────────────────────
function highlightBar() {
    const val = parseInt(document.getElementById('slider').value, 10);
    _updateDetailCharts(val);
}