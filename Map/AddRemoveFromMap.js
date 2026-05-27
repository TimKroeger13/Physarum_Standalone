async function RemoveLayer(LayerList){
    for (const layer of LayerList) {
        map.removeLayer(layer);
    }
    LayerList.length = 0;  // clears the original array in-place
}

async function AddGeoJsonToMap(LayerList, geoJson, color, zoom){
    geoJsonLayer = L.geoJSON(geoJson, {
        renderer: _canvasRenderer,
        style: function (feature) {
            return {
                color: color,
            };
        },
        onEachFeature: function (feature, layer) {
            if (feature.properties && feature.properties.value) {
                layer.bindPopup("Value: " + feature.properties.value);
            }
        }
    }).addTo(map);

    if(zoom){
        map.fitBounds(geoJsonLayer.getBounds());
    }

    LayerList.push(geoJsonLayer);
}

// Background rendering for the potential network (stays behind all points)
async function AddGeoJsonToMap_NetworkBg(LayerList, geoJson, zoom) {
    const layer = L.geoJSON(geoJson, {
        renderer: _networkBgRenderer,
        style: {
            color:   '#4477cc',
            weight:  2.5,
            opacity: 0.55,
        }
    }).addTo(map);
    if (zoom && layer.getLayers().length) map.fitBounds(layer.getBounds());
    LayerList.push(layer);
}

// Quiet lines connecting houses to the network snap points
async function AddGeoJsonToMap_ConnectionLines(LayerList, geoJson) {
    const layer = L.geoJSON(geoJson, {
        renderer: _networkBgRenderer,
        style: {
            color:   '#4477cc',
            weight:  1.5,
            opacity: 0.40,
        }
    }).addTo(map);
    LayerList.push(layer);
}


async function AddGeoJsonToMapUserValues(LayerList, geoJson){

    var min = Number.POSITIVE_INFINITY;
    var max = Number.NEGATIVE_INFINITY;

    geoJson.features.forEach(function(feature) {
        var value = feature.properties.value;
        if (value < min) min = value;
        if (value > max) max = value;
    });

    var exponent = 0.4; // probier 0.3, 0.5, 0.7 etc.

    var scaleSize = d3.scalePow()
        .exponent(exponent)
        .domain([min, max])
        .range([3, 10]);

    var scaleColor = d3.scalePow()
        .exponent(exponent)
        .domain([min, max])
        .range(['#ffffff', '#a10000']);

    var geoJsonLayer = L.geoJSON(geoJson, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                renderer: _pointsRenderer,
                radius: scaleSize(feature.properties.value),
                fillColor: scaleColor(feature.properties.value),
                color: '#000000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });
        }
    }).addTo(map);

    map.fitBounds(geoJsonLayer.getBounds());

    LayerList.push(geoJsonLayer);
}

async function AddGeoJsonToMapUserValuesEndUser(LayerList, geoJson, UsageMin, UsageMax){

    const scaleSize = d3.scaleLinear()
        .domain([UsageMin, UsageMax])
        .range([4, 10]);

    var geoJsonLayer = L.geoJSON(geoJson, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                renderer:    _pointsRenderer,
                radius:      scaleSize(feature.properties.value),
                fillColor:   '#ac5a18',
                color:       '#0a0e14',
                weight:      1,
                opacity:     1,
                fillOpacity: 1
            });
        }
    }).addTo(map);

    LayerList.push(geoJsonLayer);
}

async function AddGeoJsonToMapSourceValue(LayerList, geoJson){

    var geoJsonLayer = L.geoJSON(geoJson, {
        pointToLayer: function (feature, latlng) {
            // Diamond divIcon — visually distinct from circular demand points
            return L.marker(latlng, {
                icon: L.divIcon({
                    className:   '',       // suppress Leaflet's white-box default
                    html:        '<div class="source-diamond"></div>',
                    iconSize:    [20, 20],
                    iconAnchor:  [10, 10],
                    popupAnchor: [0, -12]
                })
            });
        }
    }).addTo(map);

    map.fitBounds(geoJsonLayer.getBounds());

    LayerList.push(geoJsonLayer);
}

async function AddGeoJsonToMap_Pipeline(glowList, coreList, geoJson) {
    const core = L.geoJSON(geoJson, {
        renderer: _canvasRenderer,
        style: {
            color:    '#FF6A00',
            weight:   4,
            opacity:  1.0,
            lineCap:  'round',
            lineJoin: 'round'
        }
    }).addTo(map);
    coreList.push(core);
}

async function AddGeoJsonToMapRandomColour(LayerList, geoJson){
    function getRandomColor() {
        var letters = '0123456789ABCDEF';
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    geoJsonLayer = L.geoJSON(geoJson, {
        style: function (feature) {
            return {
                color: getRandomColor(),
            };
        },
        onEachFeature: function (feature, layer) {
            if (feature.properties && feature.properties.value) {
                layer.bindPopup("Value: " + feature.properties.value);
            }
        }
    }).addTo(map);

    map.fitBounds(geoJsonLayer.getBounds()); 

    LayerList.push(geoJsonLayer);
}