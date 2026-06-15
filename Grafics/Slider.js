// Slider.js — highlightBar + connection navigation

// Called by SliderMove in CalGeometry.js on every input event
function highlightBar() {
    const val = parseInt(document.getElementById('slider').value, 10);
    if (typeof _updateDetailCharts === 'function') {
        _updateDetailCharts(val);
    }
}

// Jump slider to previous connection event
function prevConnection() {
    const slider  = document.getElementById('slider');
    const usage   = window.EntireUsage;
    if (!usage || !usage.length) {
        // Fallback: single-step when no connection data available
        slider.value = Math.max(parseInt(slider.min, 10), parseInt(slider.value, 10) - 1);
        slider.dispatchEvent(new Event('input'));
        return;
    }
    const curIdx  = typeof getCurrentConnIdx === 'function' ? getCurrentConnIdx() : 0;
    const prevIdx = Math.max(0, curIdx - 1);
    slider.value  = usage[prevIdx].occurence;
    slider.dispatchEvent(new Event('input'));
}

// Jump slider to next connection event
function nextConnection() {
    const slider  = document.getElementById('slider');
    const usage   = window.EntireUsage;
    if (!usage || !usage.length) {
        slider.value = Math.min(parseInt(slider.max, 10), parseInt(slider.value, 10) + 1);
        slider.dispatchEvent(new Event('input'));
        return;
    }
    const curIdx  = typeof getCurrentConnIdx === 'function' ? getCurrentConnIdx() : 0;
    const nextIdx = Math.min(usage.length - 1, curIdx + 1);
    slider.value  = usage[nextIdx].occurence;
    slider.dispatchEvent(new Event('input'));
}

// Keyboard support: arrow keys when slider is focused
document.addEventListener('keydown', function(event) {
    const focused = document.activeElement;
    const isSlider = focused && focused.id === 'slider';
    // Only hijack if slider is focused or no input is focused
    const anyInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (anyInput && !isSlider) return;

    if (event.key === 'ArrowLeft'  || event.key === 'ArrowDown')  { event.preventDefault(); prevConnection(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp')    { event.preventDefault(); nextConnection(); }
});