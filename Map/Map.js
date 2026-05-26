var map;
var L;

let SourceList = [];
let NetworkList = [];
let UserList = [];

let UserOnLineList = [];
let CompleteNetworkList = [];

let EntireNetworkList = [];
let EndUserValueList = [];
let CurrentConnectionList = [];
let ForcedList = [];

const _canvasRenderer = L.canvas({ padding: 0.5 });

async function InitializeMap() {

    map = L.map('map', {
        keyboard: false,
        preferCanvas: true
      }).setView([52.52, 13.40], 12);


window._tileLayers = {
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 20,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        })
    };

    window._activeTile = 'osm';
    window._tileLayers.osm.addTo(map);
}

function switchTileLayer(name) {
    if (window._activeTile === name) return;
    map.removeLayer(window._tileLayers[window._activeTile]);
    window._tileLayers[name].addTo(map);
    window._activeTile = name;
    document.getElementById('tileOsm').classList.toggle('active', name === 'osm');
    document.getElementById('tileDark').classList.toggle('active', name === 'dark');
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
    await AddGeoJsonToMap(UserOnLineList, geoJson, "#3388FF", true)
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

async function AddGeoJsonFeatureToMap_CurrentConnection(geoJson) {
    await RemoveLayer(CurrentConnectionList);
    await AddGeoJsonToMap(CurrentConnectionList, geoJson, "#f88e03", false);
}

async function ClearCurrentConnection() {
    await RemoveLayer(CurrentConnectionList);
}

async function AddGeoJsonFeatureToMap_Forced(geoJson) {
    await RemoveLayer(ForcedList);
    const layer = L.geoJSON(geoJson, {
        renderer: _canvasRenderer,
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 9,
                fillColor: '#c060ff',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.85
            });
        },
        onEachFeature: function (feature, layer) {
            layer.bindPopup('Forced connection' +
                (feature.properties && feature.properties.value
                    ? ' · ' + feature.properties.value : ''));
        }
    }).addTo(map);
    if (layer.getLayers().length) map.fitBounds(layer.getBounds());
    ForcedList.push(layer);
}