  function highlightBar() {
    const value = parseInt(slider.value);
    const bars = document.querySelectorAll('.Bar');

    bars.forEach((bar, index) => {
        if (index + 1 === value) { // Index is zero-based
            bar.classList.add('Highlighted');
            bar.style.opacity = '1'; // Set opacity to 1 when highlighted
            bar.style.boxShadow = '0 0 10px #ff0000'; // Add a red glow effect
        } else {
            bar.classList.remove('Highlighted');
            bar.style.opacity = '0.8'; // Set opacity to default (you can adjust this value)
            bar.style.boxShadow = 'none'; // Remove glow effect
        }
    });
}