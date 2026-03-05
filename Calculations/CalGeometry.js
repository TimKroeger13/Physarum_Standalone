var SourceGeometry;
var NetworkGeometry;
var UserGeometry;

var ConnectionPoints;
var EntireNetwork;
var EntireUsage;

var TotalEndOutputDisplay = []
var TotalEndUsageDisplay = []
var EntireUsageOccurence = []
var EntireUsageId = []

var UsageMin;
var UsageMax;

async function loadSourceData(){

    SourceGeometry = await loadData();

    await AddGeoJsonFeatureToMap_Source(SourceGeometry);
}

async function loadNetworkData(){

    NetworkGeometry = await loadData();

    await AddGeoJsonFeatureToMap_Network(NetworkGeometry);
}

async function loadUserData(){

    UserGeometry = await loadData();

    await AddGeoJsonFeatureToMap_User(UserGeometry);
}

//model

async function modeldata(){

    let modelJson = await loadData();

    EntireNetwork = modelJson[0].EntireNetwork;
    EntireUsageId = modelJson[0].EntireUsageId;
    EntireUsageOccurence = modelJson[0].EntireUsageOccurence;
    NetworkGeometry = modelJson[0].NetworkGeometry;
    SourceGeometry = modelJson[0].SourceGeometry;
    TotalEndOutputDisplay = modelJson[0].TotalEndOutputDisplay;
    TotalEndUsageDisplay = modelJson[0].TotalEndUsageDisplay;
    UserGeometry = modelJson[0].UserGeometry;
    EntireUsage = modelJson[0].EntireUsage;

    var PathProfit = []

    for (let i = 0; i < EntireNetwork.length; i++) {
        PathProfit.push(EntireNetwork[i].PathTotalProfit);
    }

    const UsageMinMax = findMinMax(EntireUsage);

    UsageMin = UsageMinMax.min;
    UsageMax = UsageMinMax.max;

    //Show grafics

    ShowGrafics()
    displayBarPlot(PathProfit)

    const slider = document.getElementById('slider');
    slider.max = PathProfit.length;

    await AddGeoJsonFeatureToMap_Source(SourceGeometry);
    await AddGeoJsonFeatureToMap_Network(NetworkGeometry);
    await AddGeoJsonFeatureToMap_User(UserGeometry);

}


async function calculate(){

    if(SourceGeometry == null || NetworkGeometry == null || UserGeometry == null){
        window.alert("Not all inputs defined!")
        return 0;
    }

    ShowLoadDataClass()

    var pointFeatures = await getNearestPointsOfFeatureCollectionAndLine(SourceGeometry, NetworkGeometry, UserGeometry);

    var newPointFeatures = turf.featureCollection(pointFeatures);

    ConnectionPoints = newPointFeatures;

    var lines = connectPoints(UserGeometry, newPointFeatures);

    await AddGeoJsonFeatureToMap_UserOneLine(lines);

    var FragmentedNetwork = await getFragmentedLineNetwork(NetworkGeometry, lines);

    var CompleteNetwork = await getCompleteNetwork(FragmentedNetwork, ConnectionPoints);

    // Display the source network immediately as the starting "already built" infrastructure
    var initialNetwork = turf.featureCollection(SourceGeometry.features);
    await AddGeoJsonFeatureToMap_EntireNetwork(initialNetwork);

    [EntireNetwork, EntireUsage] = await calculateTheEntireNetwork(CompleteNetwork, SourceGeometry, UserGeometry)
    //Display on map
    
    for (let i = 0; i < EntireNetwork.length; i++) {
        TotalEndOutputDisplay.push(EntireNetwork[i].data);
    }

    TestOutputFeature = turf.featureCollection(TotalEndOutputDisplay)
    await AddGeoJsonFeatureToMap_EntireNetwork(TestOutputFeature);

    //GetLastValues

    var PathProfit = []

    for (let i = 0; i < EntireNetwork.length; i++) {
        PathProfit.push(EntireNetwork[i].PathTotalProfit);
    }

    for (let i = 0; i < EntireUsage.length; i++) {
        TotalEndUsageDisplay.push(EntireUsage[i].data);
    }

    for (let i = 0; i < EntireUsage.length; i++) {
        EntireUsageOccurence.push(EntireUsage[i].occurence);
    }

    for (let i = 0; i < EntireUsage.length; i++) {
        EntireUsageId.push(EntireUsage[i].id);
    }

    const UsageMinMax = findMinMax(EntireUsage);

    UsageMin = UsageMinMax.min;
    UsageMax = UsageMinMax.max;

    //Show grafics

    ShowGrafics()
    displayBarPlot(PathProfit)

    const slider = document.getElementById('slider');
    slider.max = PathProfit.length;

}

async function SliderMove(){

    const sliderElement = document.getElementById('slider');

    highlightBar();

    var SelectedData = TotalEndOutputDisplay.slice(0, sliderElement.value);

    OutputFeature = turf.featureCollection(SelectedData);
    await AddGeoJsonFeatureToMap_EntireNetwork(OutputFeature);


    const filteredList = EntireUsageOccurence.filter(item => item <= sliderElement.value);

    var SelectedDataUsage = TotalEndUsageDisplay.slice(0, (filteredList.length));

    OutputFeatureUsage = turf.featureCollection(SelectedDataUsage);
    await AddGeoJsonFeatureToMap_EndUser(OutputFeatureUsage, UsageMin, UsageMax);


    const UsageProfitElement = document.getElementById('UsageProfit');
    UsageProfitElement.innerHTML = "Nutzlast pro Meter: " + Math.round(EntireNetwork[SelectedData.length-1].PathTotalProfit) +" kWh/m";

    const UsageNumElement = document.getElementById('UsageNum');
    UsageNumElement.innerHTML = "Nutzlast: " + Math.round(EntireNetwork[SelectedData.length-1].PathValue) + " kWh";

    const TotalLengthElement = document.getElementById('TotalLength');
    TotalLengthElement.innerHTML = "Gesamtlänge: " + Math.round(EntireNetwork[SelectedData.length-1].PathLength) + " Meter";


}


function findMinMax(usageList) {
    if (!Array.isArray(usageList) || usageList.length === 0) {
        return { min: null, max: null };
    }

    let maxValue = Number.NEGATIVE_INFINITY;
    let minValue = Number.POSITIVE_INFINITY;

    for (let i = 0; i < usageList.length; i++) {
        const value = usageList[i].value;

        if (typeof value === 'number') {
            maxValue = Math.max(maxValue, value);
            minValue = Math.min(minValue, value);
        }
        else if (Array.isArray(value) && value.length > 0) {
            const maxInEntry = Math.max(...value);
            const minInEntry = Math.min(...value);

            maxValue = Math.max(maxValue, maxInEntry);
            minValue = Math.min(minValue, minInEntry);
        }
    }

    return { min: minValue, max: maxValue };
}


async function handleExportButtonClick() {
    try {
        await Export();
    } catch (err) {
        console.error("Error exporting data:", err);
    }
}

async function Export() {

    const sliderElement = document.getElementById('slider');

    if (sliderElement.value == 0 || sliderElement.value == 1){
        sliderElement.value = sliderElement.max;
    }


    const filteredList = EntireUsageOccurence.filter(item => item <= sliderElement.value);

    var SelectedDataUsage = TotalEndUsageDisplay.slice(0, (filteredList.length));
    var OutputFeatureUsage = turf.featureCollection(SelectedDataUsage);

    var SelectedData = TotalEndOutputDisplay.slice(0, sliderElement.value);
    var OutputFeature = turf.featureCollection(SelectedData);

    var SelectedUsageId = EntireUsageId.slice(0, (filteredList.length));

    //model

    var ModelOutput = [];

    ModelOutput.push({
        SourceGeometry: SourceGeometry,
        NetworkGeometry: NetworkGeometry,
        UserGeometry: UserGeometry,
        TotalEndOutputDisplay: TotalEndOutputDisplay,
        TotalEndUsageDisplay: TotalEndUsageDisplay,
        EntireUsageOccurence: EntireUsageOccurence,
        EntireNetwork: EntireNetwork,
        EntireUsageId: EntireUsageId,
        EntireUsage: EntireUsage
    })


    download(JSON.stringify(SourceGeometry), 'Source.geojson', 'application/json');
    download(JSON.stringify(OutputFeatureUsage), 'Houses.geojson', 'application/json');
    download(JSON.stringify(OutputFeature), 'Network.geojson', 'application/json');
    download(JSON.stringify(SelectedUsageId), 'UserId.txt', 'text/plain');
    download(JSON.stringify(ModelOutput), 'Model.phy', 'application/json');
}

function download(content, fileName, contentType) {
    var a = document.createElement("a");
    var file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}