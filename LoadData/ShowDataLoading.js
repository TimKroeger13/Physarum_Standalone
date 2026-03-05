function ShowLoadDataClass() {
    var InLoadingElement = document.querySelector('.InLoading');
    var LoadDataElement = document.querySelector('.LoadData');

    LoadDataElement.style.visibility = 'hidden';
    LoadDataElement.style.height = '0';

    //InLoadingElement.style.display = 'block';
    InLoadingElement.style.visibility = 'visible';
    InLoadingElement.style.height = '8vh';
}

function ShowGrafics() {
    var InLoadingElement = document.querySelector('.InLoading');
    var BarPlotElement = document.querySelector('.BarPlot');
    var SliderElement = document.querySelector('.Slider');
    var DisplayDataElement = document.querySelector('.DisplayData');
    var OutputElement = document.querySelector('.Results');
    


    InLoadingElement.style.visibility = 'hidden';
    InLoadingElement.style.height = '0';


    BarPlotElement.style.visibility = 'visible';
    BarPlotElement.style.height = '7vh';

    SliderElement.style.visibility = 'visible';
    SliderElement.style.height = '2vh';

    OutputElement.style.visibility = 'visible';
    OutputElement.style.height = '2vh';

    DisplayDataElement.style.height = '84vh';
}


function updateLoadingStatus(calculationCounter, calculationTotalLength) {
    var calPathElement = document.getElementById('calPath');
    calPathElement.innerHTML = "Calculate Paths: " + calculationCounter + " / " + calculationTotalLength;
}
