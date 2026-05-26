var SourceGeometry;
var NetworkGeometry;
var UserGeometry;
var ForcedGeometry;

var ConnectionPoints;
var ConnectionLines;
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

async function loadForcedData() {

    ForcedGeometry = await loadData();

    await AddGeoJsonFeatureToMap_Forced(ForcedGeometry);
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
    ConnectionLines = modelJson[0].ConnectionLines || null;

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

    // Reconstruct connection lines from geometry if not in model (old .phy files)
    if (!ConnectionLines && UserGeometry && NetworkGeometry) {
        const pointFeatures = await getNearestPointsOfFeatureCollectionAndLine(SourceGeometry, NetworkGeometry, UserGeometry);
        const newPointFeatures = turf.featureCollection(pointFeatures);
        ConnectionLines = connectPoints(UserGeometry, newPointFeatures);
    }

    // Show house connection lines as blue streets — slider stays at 0
    if (ConnectionLines) {
        await AddGeoJsonFeatureToMap_UserOneLine(ConnectionLines);
    }

    // Slider starts at 1 (nothing built yet) — user builds network by dragging
    document.getElementById('slider').value = 1;

}


async function calculate(){

    if(SourceGeometry == null || NetworkGeometry == null || UserGeometry == null){
        window.alert("Not all inputs defined!")
        return 0;
    }

    ShowLoadDataClass()

    // Copy UserGeometry so the original is never mutated.
    // Property objects are also copied so we can stamp forcedWeight onto them
    // without affecting the source data across re-runs.
    const userGeomForCalc = {
        type: 'FeatureCollection',
        features: UserGeometry.features.map(f => ({ ...f, properties: { ...f.properties } }))
    };

    // ── Apply forced connections ───────────────────────────────
    // For each forced point: if it overlaps a demand point (≤10 m)
    // that demand point is promoted to forced (keeps its value).
    // Otherwise a zero-demand forced placeholder is inserted.
    if (ForcedGeometry) {
        const FORCED_WEIGHT  = 1e9;   // dominates all real demand weights
        const OVERLAP_KM     = 0.010; // 10 metres overlap threshold
        for (const ff of ForcedGeometry.features) {
            if (ff.geometry.type !== 'Point') continue;
            let overlapped = false;
            for (const uf of userGeomForCalc.features) {
                if (uf.geometry.type !== 'Point') continue;
                if (turf.distance(ff, uf, { units: 'kilometers' }) < OVERLAP_KM) {
                    uf.properties.forcedWeight = FORCED_WEIGHT;
                    overlapped = true;
                    break;
                }
            }
            if (!overlapped) {
                // Standalone forced point — no real demand value
                userGeomForCalc.features.push({
                    type: 'Feature',
                    geometry: ff.geometry,
                    properties: { value: 0, forcedWeight: FORCED_WEIGHT }
                });
            }
        }
    }

    var pointFeatures = await getNearestPointsOfFeatureCollectionAndLine(SourceGeometry, NetworkGeometry, userGeomForCalc);

    var newPointFeatures = turf.featureCollection(pointFeatures);

    ConnectionPoints = newPointFeatures;

    ConnectionLines = connectPoints(userGeomForCalc, newPointFeatures);

    await AddGeoJsonFeatureToMap_UserOneLine(ConnectionLines);

    var FragmentedNetwork = await getFragmentedLineNetwork(NetworkGeometry, ConnectionLines);

    var CompleteNetwork = await getCompleteNetwork(FragmentedNetwork, ConnectionPoints);

    // Display the source network immediately as the starting "already built" infrastructure
    var initialNetwork = turf.featureCollection(SourceGeometry.features);
    await AddGeoJsonFeatureToMap_EntireNetwork(initialNetwork);

    [EntireNetwork, EntireUsage] = await calculateTheEntireNetwork(CompleteNetwork, SourceGeometry, userGeomForCalc)
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
    UsageNumElement.innerHTML = "Nutzlast: " + Math.round(Math.round(EntireNetwork[SelectedData.length-1].PathValue)/1000/10)/100 + " GWh";

    const TotalLengthElement = document.getElementById('TotalLength');
    TotalLengthElement.innerHTML = "Gesamtlänge: " + Math.round(Math.round(EntireNetwork[SelectedData.length-1].PathLength)/10)/100 + " Kilometer";


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
        EntireUsage: EntireUsage,
        ConnectionLines: ConnectionLines
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

async function resetToInput() {
    // Clear calculation results
    ConnectionPoints = undefined;
    ConnectionLines = undefined;
    EntireNetwork = undefined;
    EntireUsage = undefined;
    TotalEndOutputDisplay = [];
    TotalEndUsageDisplay = [];
    EntireUsageOccurence = [];
    EntireUsageId = [];
    UsageMin = undefined;
    UsageMax = undefined;

    // Remove calculation map layers, keep Source/Network/User
    await RemoveLayer(UserOnLineList);
    await RemoveLayer(EntireNetworkList);
    await RemoveLayer(EndUserValueList);
    await RemoveLayer(CurrentConnectionList);

    // Clear chart
    document.getElementById('chartPanel').innerHTML = '';

    // Reset slider
    const slider = document.getElementById('slider');
    slider.min = 1;
    slider.max = 10;
    slider.value = 1;

    // Reset result labels
    document.getElementById('UsageProfit').innerHTML = '—';
    document.getElementById('UsageNum').innerHTML = '—';
    document.getElementById('TotalLength').innerHTML = '—';

    // Restore UI: show load bar, hide charts/slider/results/handle, expand map
    document.querySelector('.LoadData').style.display = '';
    const handle = document.getElementById('resizeHandle');
    handle.style.visibility = 'hidden';
    handle.style.height = '0';
    document.querySelector('.InLoading').style.visibility = 'hidden';
    document.querySelector('.InLoading').style.height = '0';
    document.querySelector('.BarPlot').style.visibility = 'hidden';
    document.querySelector('.BarPlot').style.height = '0';
    document.querySelector('.Slider').style.visibility = 'hidden';
    document.querySelector('.Slider').style.height = '0';
    document.querySelector('.Results').style.visibility = 'hidden';
    document.querySelector('.Results').style.height = '0';
    document.querySelector('.DisplayData').style.height = '93vh';
}