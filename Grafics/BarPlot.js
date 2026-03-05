// ============================================================
//  BarPlot.js  —  D3 chart system (replaces DOM bar plot)
//
//  Three panels:
//    1. Overview  — smooth area chart of full PathTotalProfit series
//                   with top-3 peaks marked and slider position line
//    2. Zoom      — 100-element window around current slider position
//                   showing PathTotalProfit as a line chart
//    3. Win/Loss  — per-connection marginal kWh/m as coloured bars
//                   green ≥ 1000, red < 1000, cutoff line at 1000
//
//  Public API (same as before):
//    displayBarPlot(numbers)   — called once after calculation
//    highlightBar()            — called on slider input
// ============================================================

const WIN_LOSS_CUTOFF = 1000;
const ZOOM_WINDOW     = 100;        // elements shown in zoom view
const TOP_N           = 3;          // highlight this many peaks

// Module state
let _profit    = [];                 // PathTotalProfit[] from CalGeometry
let _marginal  = [];                 // marginal kWh/m per new connection
let _top3      = [];                 // sorted indices of top-N values

// D3 references kept for incremental updates in highlightBar()
let _oG        = null;               // overview inner <g>
let _overviewX = null;               // overview x-scale
let _zG        = null;               // zoom inner <g>
let _wG        = null;               // win/loss inner <g>
let _zDims     = null;               // { inW, inH, xPad, yPad }
let _wDims     = null;               // { inW, inH, xPad, yPad }
let _built     = false;

// ── Public: called once after calculation ────────────────────
async function displayBarPlot(numbers) {
    _profit = numbers;

    // Compute marginal efficiency (kWh/m per new connection)
    const net = window.EntireNetwork || [];
    _marginal = numbers.map((_, i) => {
        if (i >= net.length) return 0;
        if (i === 0) {
            return net[0].PathLength > 0 ? net[0].PathValue / net[0].PathLength : 0;
        }
        const dV = (net[i].PathValue  || 0) - (net[i - 1].PathValue  || 0);
        const dL = (net[i].PathLength || 0) - (net[i - 1].PathLength || 0);
        return dL > 0 ? dV / dL : 0;
    });

    // Top-N indices by highest PathTotalProfit, sorted ascending for iteration
    _top3 = numbers
        .map((v, i) => ({ v, i }))
        .sort((a, b) => b.v - a.v)
        .slice(0, TOP_N)
        .map(x => x.i);

    // Double-rAF ensures container has its CSS dimensions before we measure
    requestAnimationFrame(() => requestAnimationFrame(_buildCharts));
}

// ── Internal: build all SVG panels once ─────────────────────
function _buildCharts() {
    const container = document.getElementById('chartPanel');
    if (!container) return;
    container.innerHTML = '';
    _built = false;

    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W < 10 || H < 10) return;   // not yet visible

    // Height split: overview 42%, detail row 58%
    const oH = Math.max(40, Math.round(H * 0.42));
    const dH = H - oH;

    // Padding inside each SVG (top, right, bottom, left)
    const oP = { t:8,  r:12, b:18, l:44 };
    const zP = { t:8,  r:8,  b:18, l:44 };
    const wP = { t:8,  r:16, b:18, l:52 };

    // Width split for detail row: zoom 57%, win/loss 43%
    const zW = Math.round(W * 0.57);
    const wW = W - zW;

    // ── Build wrapper divs ───────────────────────────────
    const overviewWrap = document.createElement('div');
    overviewWrap.className = 'chart-overview-wrap';
    overviewWrap.style.height = oH + 'px';
    container.appendChild(overviewWrap);

    const detailWrap = document.createElement('div');
    detailWrap.className = 'chart-detail-wrap';
    detailWrap.style.height = dH + 'px';
    container.appendChild(detailWrap);

    const zoomWrap = document.createElement('div');
    zoomWrap.className = 'chart-zoom-wrap';
    zoomWrap.style.width = zW + 'px';
    detailWrap.appendChild(zoomWrap);

    const wlWrap = document.createElement('div');
    wlWrap.className = 'chart-winloss-wrap';
    wlWrap.style.width = wW + 'px';
    detailWrap.appendChild(wlWrap);

    // ── Overview SVG ─────────────────────────────────────
    const svgO = d3.select(overviewWrap)
        .append('svg')
        .attr('width', W).attr('height', oH);

    const oInW = W - oP.l - oP.r;
    const oInH = oH - oP.t - oP.b;

    const xO = d3.scaleLinear().domain([0, _profit.length - 1]).range([0, oInW]);
    const yO = d3.scaleLinear().domain([0, d3.max(_profit) * 1.08 || 1]).range([oInH, 0]);
    _overviewX = xO;

    _oG = svgO.append('g').attr('transform', `translate(${oP.l},${oP.t})`);

    // Y-axis grid
    _oG.append('g')
        .call(d3.axisLeft(yO).ticks(3).tickSize(-oInW)
            .tickFormat(d => d >= 1000 ? (d/1000).toFixed(1)+'k' : d))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('.tick line')
            .attr('stroke', 'rgba(255,255,255,0.07)').attr('stroke-dasharray','3,3'))
        .call(g => g.selectAll('.tick text')
            .attr('fill', '#6e7681').attr('font-size', '9px')
            .attr('font-family', "'IBM Plex Mono', monospace"));

    // Clip path so area doesn't overflow
    svgO.append('defs').append('clipPath').attr('id', 'clip-overview')
        .append('rect').attr('width', oInW).attr('height', oInH);

    const chartG = _oG.append('g').attr('clip-path', 'url(#clip-overview)');

    // Area fill
    chartG.append('path')
        .datum(_profit)
        .attr('fill', 'rgba(114,255,0,0.10)')
        .attr('d', d3.area()
            .x((_, i) => xO(i)).y0(oInH).y1(d => yO(d))
            .curve(d3.curveCatmullRom.alpha(0.5)));

    // Smooth line
    chartG.append('path')
        .datum(_profit)
        .attr('fill', 'none')
        .attr('stroke', '#72FF00')
        .attr('stroke-width', 1.5)
        .attr('d', d3.line()
            .x((_, i) => xO(i)).y(d => yO(d))
            .curve(d3.curveCatmullRom.alpha(0.5)));

    // Top-N peak markers (gold / silver / bronze)
    const peakColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    _top3.forEach((idx, rank) => {
        const px = xO(idx), py = yO(_profit[idx]);
        // Triangle marker
        chartG.append('path')
            .attr('d', `M${px},${py - 10} L${px - 5},${py - 2} L${px + 5},${py - 2} Z`)
            .attr('fill', peakColors[rank])
            .attr('opacity', 0.9);
        // Value label
        chartG.append('text')
            .attr('x', px).attr('y', py - 13)
            .attr('text-anchor', 'middle')
            .attr('font-size', '8.5px').attr('font-weight', '600')
            .attr('fill', peakColors[rank])
            .attr('font-family', "'IBM Plex Mono', monospace")
            .text(`#${rank + 1} ${_fmt(_profit[idx])}`);
    });

    // Slider position cursor (initially invisible)
    _oG.append('line').attr('class', 'ov-cursor')
        .attr('y1', 0).attr('y2', oInH)
        .attr('stroke', '#FF6A00').attr('stroke-width', 1.5).attr('opacity', 0);

    // Panel label
    _oG.append('text')
        .attr('x', oInW).attr('y', -2)
        .attr('text-anchor', 'end')
        .attr('font-size', '8px').attr('fill', '#6e7681')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text('OVERVIEW — avg kWh/m cumulative');

    // ── Zoom SVG ─────────────────────────────────────────
    const svgZ = d3.select(zoomWrap)
        .append('svg').attr('width', zW).attr('height', dH);

    const zInW = zW - zP.l - zP.r;
    const zInH = dH - zP.t - zP.b;

    _zG = svgZ.append('g').attr('transform', `translate(${zP.l},${zP.t})`);
    _zG.append('g').attr('class', 'z-content');
    _zG.append('g').attr('class', 'z-yaxis');
    _zG.append('g').attr('class', 'z-xaxis').attr('transform', `translate(0,${zInH})`);
    _zG.append('text').attr('class', 'z-label')
        .attr('x', zInW / 2).attr('y', zInH + 16)
        .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', '#6e7681')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text(`ZOOM  ±${ZOOM_WINDOW / 2}  connections`);

    _zDims = { inW: zInW, inH: zInH };

    // ── Win/Loss SVG ─────────────────────────────────────
    const svgW = d3.select(wlWrap)
        .append('svg').attr('width', wW).attr('height', dH);

    const wInW = wW - wP.l - wP.r;
    const wInH = dH - wP.t - wP.b;

    _wG = svgW.append('g').attr('transform', `translate(${wP.l},${wP.t})`);
    _wG.append('g').attr('class', 'wl-content');
    _wG.append('g').attr('class', 'wl-yaxis');
    _wG.append('g').attr('class', 'wl-cutoff');    // cutoff line layer
    _wG.append('text').attr('class', 'wl-label')
        .attr('x', wInW / 2).attr('y', wInH + 16)
        .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', '#6e7681')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text('WIN / LOSS  per connection  (kWh/m)');

    _wDims = { inW: wInW, inH: wInH };

    _built = true;
    _updateDetailCharts(1);   // render at position 1
}

// ── Internal: update zoom + win/loss panels ───────────────────
function _updateDetailCharts(sliderVal) {
    if (!_built || !_profit.length) return;

    const idx     = Math.max(0, Math.min(sliderVal - 1, _profit.length - 1));
    const half    = Math.floor(ZOOM_WINDOW / 2);
    const wStart  = Math.max(0, idx - half);
    const wEnd    = Math.min(_profit.length, wStart + ZOOM_WINDOW);
    const profSlice = _profit.slice(wStart, wEnd);
    const margSlice = _marginal.slice(wStart, wEnd);

    // ── Update overview cursor ────────────────────────────
    _oG.select('.ov-cursor')
        .attr('x1', _overviewX(idx)).attr('x2', _overviewX(idx))
        .attr('opacity', 1);

    // ── Zoom panel ────────────────────────────────────────
    const { inW: zW, inH: zH } = _zDims;

    const xZ = d3.scaleLinear().domain([wStart, wEnd - 1]).range([0, zW]);
    const yZ = d3.scaleLinear()
        .domain([0, (d3.max(profSlice) || 1) * 1.12])
        .range([zH, 0]);

    const zContent = _zG.select('.z-content');
    zContent.html('');

    // Area
    zContent.append('path')
        .datum(profSlice)
        .attr('fill', 'rgba(114,255,0,0.10)')
        .attr('d', d3.area()
            .x((_, i) => xZ(wStart + i)).y0(zH).y1(d => yZ(d))
            .curve(d3.curveMonotoneX));

    // Line
    zContent.append('path')
        .datum(profSlice)
        .attr('fill', 'none')
        .attr('stroke', '#72FF00').attr('stroke-width', 1.5)
        .attr('d', d3.line()
            .x((_, i) => xZ(wStart + i)).y(d => yZ(d))
            .curve(d3.curveMonotoneX));

    // Top-N markers if visible in window
    const peakColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    _top3.forEach((tIdx, rank) => {
        if (tIdx >= wStart && tIdx < wEnd) {
            const px = xZ(tIdx), py = yZ(_profit[tIdx]);
            zContent.append('circle')
                .attr('cx', px).attr('cy', py).attr('r', 4.5)
                .attr('fill', peakColors[rank])
                .attr('stroke', '#0a0e14').attr('stroke-width', 1.5);
            zContent.append('text')
                .attr('x', px).attr('y', py - 8)
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px').attr('fill', peakColors[rank])
                .attr('font-family', "'IBM Plex Mono', monospace")
                .text(`#${rank + 1}`);
        }
    });

    // Current position cursor + dot
    if (idx >= wStart && idx < wEnd) {
        const cx = xZ(idx), cy = yZ(_profit[idx]);
        zContent.append('line')
            .attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', zH)
            .attr('stroke', '#FF6A00').attr('stroke-width', 1.5).attr('opacity', 0.7);
        zContent.append('circle')
            .attr('cx', cx).attr('cy', cy).attr('r', 4)
            .attr('fill', '#FF6A00').attr('stroke', '#0a0e14').attr('stroke-width', 1.5);
        // Value tooltip
        const labelX = cx > zW * 0.75 ? cx - 6 : cx + 6;
        const anchor  = cx > zW * 0.75 ? 'end' : 'start';
        zContent.append('text')
            .attr('x', labelX).attr('y', cy - 7)
            .attr('text-anchor', anchor)
            .attr('font-size', '9px').attr('font-weight', '600')
            .attr('fill', '#FF6A00')
            .attr('font-family', "'IBM Plex Mono', monospace")
            .text(_fmt(_profit[idx]));
    }

    // Axes
    _zG.select('.z-yaxis')
        .call(d3.axisLeft(yZ).ticks(3).tickSize(-zW)
            .tickFormat(d => d >= 1000 ? (d/1000).toFixed(1)+'k' : d))
        .call(_cleanAxis);
    _zG.select('.z-xaxis')
        .call(d3.axisBottom(xZ).ticks(4).tickFormat(d => Math.round(d)))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('.tick line').remove())
        .call(g => g.selectAll('.tick text').attr('fill','#6e7681').attr('font-size','8px')
            .attr('font-family',"'IBM Plex Mono', monospace"));

    // ── Win/Loss panel ────────────────────────────────────
    const { inW: wW, inH: wH } = _wDims;

    const absMax = Math.max(d3.max(margSlice.map(Math.abs)) || 0, WIN_LOSS_CUTOFF) * 1.25;
    const yW = d3.scaleLinear().domain([0, absMax]).range([wH, 0]);

    const barW = Math.max(1, (wW / margSlice.length) - 1);

    const wlContent = _wG.select('.wl-content');
    wlContent.html('');

    // Bars
    wlContent.selectAll('rect.wl-bar')
        .data(margSlice)
        .join('rect').attr('class', 'wl-bar')
        .attr('x',      (_, i) => i * (barW + 1))
        .attr('y',      d => yW(Math.max(0, d)))
        .attr('width',  barW)
        .attr('height', d => Math.abs(yW(d) - yW(0)))
        .attr('fill',   d => d >= WIN_LOSS_CUTOFF
            ? 'rgba(114,255,0,0.72)'
            : 'rgba(255,80,80,0.72)');

    // Current position highlight column
    const wlIdx = idx - wStart;
    if (wlIdx >= 0 && wlIdx < margSlice.length) {
        wlContent.append('rect')
            .attr('x', wlIdx * (barW + 1) - 1)
            .attr('y', 0).attr('width', barW + 2).attr('height', wH)
            .attr('fill', 'rgba(255,106,0,0.18)').attr('pointer-events','none');
        // Value label
        const mv = margSlice[wlIdx];
        wlContent.append('text')
            .attr('x', Math.min(wlIdx * (barW + 1) + barW / 2, wW - 2))
            .attr('y', Math.max(yW(Math.max(0, mv)) - 4, 10))
            .attr('text-anchor', 'middle')
            .attr('font-size', '8px').attr('font-weight', '600')
            .attr('fill', mv >= WIN_LOSS_CUTOFF ? '#72FF00' : '#ff5050')
            .attr('font-family', "'IBM Plex Mono', monospace")
            .text(_fmt(mv));
    }

    // Cutoff reference line
    const cutoffY = yW(WIN_LOSS_CUTOFF);
    const cutoffG = _wG.select('.wl-cutoff');
    cutoffG.html('');
    cutoffG.append('line')
        .attr('x1', 0).attr('x2', wW)
        .attr('y1', cutoffY).attr('y2', cutoffY)
        .attr('stroke', 'rgba(255,106,0,0.8)')
        .attr('stroke-width', 1).attr('stroke-dasharray', '5,3');
    cutoffG.append('text')
        .attr('x', 2).attr('y', cutoffY - 3)
        .attr('font-size', '8px').attr('fill', 'rgba(255,106,0,0.9)')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .text('1000');

    // Y-axis
    _wG.select('.wl-yaxis')
        .call(d3.axisLeft(yW).ticks(3).tickSize(-wW)
            .tickFormat(d => d >= 1000 ? (d/1000).toFixed(1)+'k' : d))
        .call(_cleanAxis);
}

// ── Shared axis cleanup helper ───────────────────────────────
function _cleanAxis(g) {
    g.select('.domain').remove();
    g.selectAll('.tick line')
        .attr('stroke', 'rgba(255,255,255,0.07)')
        .attr('stroke-dasharray', '3,3');
    g.selectAll('.tick text')
        .attr('fill', '#6e7681').attr('font-size', '9px')
        .attr('font-family', "'IBM Plex Mono', monospace");
}

// ── Format numbers compactly ─────────────────────────────────
function _fmt(v) {
    if (v == null || !isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
    return Math.round(v).toString();
}

// ── Public: called by SliderMove in CalGeometry.js ───────────
function highlightBar() {
    const val = parseInt(document.getElementById('slider').value, 10);
    _updateDetailCharts(val);
}