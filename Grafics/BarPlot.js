async function displayBarPlot(numbers){
    createBarPlot(numbers); //createBarPlot(generateRandomNumbers(200, 1, 100));
}
  
// Function to create the bar plot
function createBarPlot(numbers) {
    const barPlot = document.querySelector('.BarPlot');
    const maxHeight = 100; // Set the maximum height of the bars
    const maxNumber = Math.max(...numbers); // Find the maximum number in the array

    // Calculate the scaling factor to fit the numbers within the maxHeight
    const scaleFactor = maxHeight / maxNumber;

    numbers.forEach((number, index) => {
        // Scale down the number to fit within the maxHeight
        const scaledNumber = number * scaleFactor;

        const bar = document.createElement('div');
        bar.classList.add('Bar');
        bar.style.height = `${scaledNumber}%`; // Use the scaled number for the height
        bar.style.width = `${barPlot.clientWidth / numbers.length}px`;
        bar.style.left = `${index * (barPlot.clientWidth / numbers.length)}px`;
        barPlot.appendChild(bar);
    });

    /*
    // Calculate the scaled height for the value of 1000
    const height1000 = 100 * scaleFactor;

    // Create the horizontal line indicator
    const horizontalLine = document.createElement('div');
    horizontalLine.classList.add('HorizontalLine');
    horizontalLine.style.height = '1px'; // Initial height (1px)
    horizontalLine.style.width = '100%'; // Same width as the bar plot
    horizontalLine.style.position = 'absolute';
    horizontalLine.style.top = `${height1000}%`; // Position at the scaled height of 1000
    barPlot.appendChild(horizontalLine);*/
}
