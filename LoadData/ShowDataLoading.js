// ShowDataLoading.js — UI state transitions

function ShowLoadDataClass() {
    document.querySelector('.LoadData').style.display = 'none';

    const loading = document.querySelector('.InLoading');
    loading.style.visibility = 'visible';
    loading.style.height = '8vh';
}

function ShowGrafics() {
    // Hide loading spinner
    const loading = document.querySelector('.InLoading');
    loading.style.visibility = 'hidden';
    loading.style.height = '0';

    // Show chart panel (20vh tall)
    const chart = document.querySelector('.BarPlot');
    chart.style.visibility = 'visible';
    chart.style.height = '12vh';

    // Show slider (2vh)
    const slider = document.querySelector('.Slider');
    slider.style.visibility = 'visible';
    slider.style.height = '2vh';

    // Show results bar (3vh)
    const results = document.querySelector('.Results');
    results.style.visibility = 'visible';
    results.style.height = '3vh';

    // Show drag handle
    const handle = document.getElementById('resizeHandle');
    handle.style.visibility = 'visible';
    handle.style.height = '6px';

    // Shrink map to fit — total header rows: 4 + 0 + 12 + 2 + 3 = 23vh
    document.querySelector('.DisplayData').style.height = '78vh';
}

function updateLoadingStatus(calculationCounter, calculationTotalLength, includedCount, skippedCount) {
    const el = document.getElementById('calPath');
    if (el) {
        const pct = Math.round((calculationCounter / calculationTotalLength) * 1000)/10;
        el.innerHTML = `Calculate Paths: ${calculationCounter} / ${calculationTotalLength} &nbsp;·&nbsp; ${pct}% &nbsp;·&nbsp; [${includedCount}]`;
    }
}