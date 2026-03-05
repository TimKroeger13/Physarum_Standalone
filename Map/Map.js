var map;
var L;

let SourceList = [];
let NetworkList = [];
let UserList = [];

let UserOnLineList = [];
let CompleteNetworkList = [];

let EntireNetworkList = [];
let EndUserValueList = [];

async function InitializeMap() {

    map = L.map('map', {
        keyboard: false
      }).setView([52.52, 13.40], 12);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
}

async function AddGeoJsonFeatureToMap_Source(geoJson){

    await RemoveLayer(SourceList)
    await AddGeoJsonToMapSourceValue(SourceList, geoJson, "#FF7200")
}

async function AddGeoJsonFeatureToMap_Network(geoJson){

    await RemoveLayer(NetworkList)
    await AddGeoJsonToMap(NetworkList, geoJson, "#3388FF", true)
}

async function AddGeoJsonFeatureToMap_User(geoJson){

    await RemoveLayer(UserList)
    await AddGeoJsonToMapUserValues(UserList, geoJson)
}

async function AddGeoJsonFeatureToMap_UserOneLine(geoJson){

    await RemoveLayer(UserOnLineList)
    await AddGeoJsonToMap(UserOnLineList, geoJson, "#404040", true)
}

async function AddGeoJsonFeatureToMap_CompleteNetwork(geoJson){

    await RemoveLayer(CompleteNetworkList)
    await AddGeoJsonToMapRandomColour(CompleteNetworkList, geoJson, "#404040")
}

async function AddGeoJsonFeatureToMap_EntireNetwork(geoJson){

    await RemoveLayer(EntireNetworkList)
    await AddGeoJsonToMap(EntireNetworkList, geoJson, "#72FF00", false)
}

async function AddGeoJsonFeatureToMap_EndUser(geoJson, UsageMin, UsageMax){

    await RemoveLayer(EndUserValueList)
    await AddGeoJsonToMapUserValuesEndUser(EndUserValueList, geoJson, UsageMin, UsageMax)
}
