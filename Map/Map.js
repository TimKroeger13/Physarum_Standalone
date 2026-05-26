var map;
var L;

let SourceList = [];
let NetworkList = [];
let UserList = [];

let UserOnLineList = [];
let CompleteNetworkList = [];

let EntireNetworkList = [];
let EntireNetworkGlowList = [];
let EndUserValueList = [];
let CurrentConnectionList = [];
let ForcedList = [];

// Initialised inside InitializeMap() after panes exist
let _canvasRenderer;
let _networkBgRenderer;
let _pointsRenderer;

async function InitializeMap() {

    map = L.map('map', {
        keyboard: false,
        preferCanvas: true
      }).setView([52.52, 13.40], 12);

    // Z-order: network bg (350) → built results (400 default) → points (450)
    map.createPane('networkBgPane').style.zIndex = 350;
    map.createPane('pointsPane').style.zIndex    = 450;
    _canvasRenderer    = L.canvas({ padding: 0.5 });
    _networkBgRenderer = L.canvas({ padding: 0.5, pane: 'networkBgPane' });
    _pointsRenderer    = L.canvas({ padding: 0.5, pane: 'pointsPane'    });


window._tileLayers = {
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 20,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 20,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
    await AddGeoJsonToMap_NetworkBg(NetworkList, geoJson, true)
}

async function AddGeoJsonFeatureToMap_User(geoJson){

    await RemoveLayer(UserList)
    await AddGeoJsonToMapUserValues(UserList, geoJson)
}

async function AddGeoJsonFeatureToMap_UserOneLine(geoJson){

    await RemoveLayer(UserOnLineList)
    await AddGeoJsonToMap_ConnectionLines(UserOnLineList, geoJson)
}

async function AddGeoJsonFeatureToMap_CompleteNetwork(geoJson){

    await RemoveLayer(CompleteNetworkList)
    await AddGeoJsonToMapRandomColour(CompleteNetworkList, geoJson, "#404040")
}

async function AddGeoJsonFeatureToMap_EntireNetwork(geoJson){

    await RemoveLayer(EntireNetworkGlowList);
    await RemoveLayer(EntireNetworkList);
    await AddGeoJsonToMap_Pipeline(EntireNetworkGlowList, EntireNetworkList, geoJson);
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
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                renderer: _pointsRenderer,
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