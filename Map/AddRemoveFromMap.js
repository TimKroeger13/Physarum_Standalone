async function RemoveLayer(LayerList){
    for (const layer of LayerList) {
        map.removeLayer(layer);
      }
      LayerList = [];
}

async function AddGeoJsonToMap(LayerList, geoJson, color, zoom){
    geoJsonLayer = L.geoJSON(geoJson, {
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


async function AddGeoJsonToMapUserValues(LayerList, geoJson){

    var min = Number.POSITIVE_INFINITY;
    var max = Number.NEGATIVE_INFINITY;

    geoJson.features.forEach(function(feature) {
        var value = feature.properties.value;
        if (value < min) min = value;
        if (value > max) max = value;
    });

    var scaleSize = d3.scaleLinear()
    .domain([min, max])
    .range([4, 10]);

    var scaleColor = d3.scaleLinear()
    .domain([min, max])
    .range(['#FF907C', '#680000']);

    var geoJsonLayer = L.geoJSON(geoJson, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
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

    var scaleSize = d3.scaleLinear()
    .domain([UsageMin, UsageMax])
    .range([4, 10]);

    var geoJsonLayer = L.geoJSON(geoJson, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: scaleSize(feature.properties.value),
                fillColor: '#FFCC00',
                color: '#000000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8 
            });
        }
    }).addTo(map);

    LayerList.push(geoJsonLayer);
}

async function AddGeoJsonToMapSourceValue(LayerList, geoJson){

    var geoJsonLayer = L.geoJSON(geoJson, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 10,
                fillColor: '#000000',
                color: '#000000',
                weight: 1,
                opacity: 1,
                fillOpacity: 1 
            });
        }
    }).addTo(map);

    map.fitBounds(geoJsonLayer.getBounds()); 

    LayerList.push(geoJsonLayer);
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