// Slider.js — delegates highlight to the D3 chart system
// highlightBar() is the only public function called by SliderMove()

function highlightBar() {
    // BarPlot.js owns the chart state; this just calls through.
    // The function is re-declared there, but keeping the call here
    // ensures CalGeometry.js (which calls highlightBar()) continues
    // to work even if BarPlot.js is loaded after Slider.js.
    const val = parseInt(document.getElementById('slider').value, 10);
    if (typeof _updateDetailCharts === 'function') {
        _updateDetailCharts(val);
    }
}