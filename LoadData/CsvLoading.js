var HouseOutput = [];

async function convertCsvToGeoJson(fileContent){

    let JsonOfCSV = ReadCSV(fileContent);

    const featureCollection = {
        type: 'FeatureCollection',
        features: []
    };

    for (let i = 0; i < JsonOfCSV.length; i++) {
        let geoJsonRequest = await httpGet("https://nominatim.openstreetmap.org/search?q=" + JsonOfCSV[i].address + ", " + JsonOfCSV[i].postcode + ", " + JsonOfCSV[i].area + "&format=geojson");
        let parsedGeoJson = JSON.parse(geoJsonRequest);
        let modifiedGeoJson = modifyGeoJson(parsedGeoJson, parseFloat(JsonOfCSV[i].value));

        HouseOutput.push([JsonOfCSV[i].address + ", " + JsonOfCSV[i].postcode + ", " + JsonOfCSV[i].area, JsonOfCSV[i].value])
    
        featureCollection.features.push(modifiedGeoJson);

        await ShowLoadingMessage(i, JsonOfCSV.length);
    }

    await RestoreTitel ();
    return featureCollection;

}

function modifyGeoJson(parsedGeoJson, value) {
    return {
        type: 'Feature',
        geometry: parsedGeoJson.features[0].geometry,
        properties: {
            value: value
        }
    };
}

function ReadCSV(csvContent) {
    const rows = csvContent.trim().split('\n');
    const headers = rows[0].split(';');
    const jsonData = [];

    for (let i = 1; i < rows.length; i++) {
        if (!rows[i]) continue; 
        const values = rows[i].split(';');
        if (values.length !== headers.length) {
            console.error('Invalid CSV format');
            return null;
        }

        const entry = {};
        for (let j = 0; j < headers.length; j++) {
            entry[headers[j].trim()] = values[j].trim();
        }
        jsonData.push(entry);
    }

    return jsonData;
}

function httpGet(theUrl) {
    return new Promise(function (resolve, reject) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", theUrl, true); // true for asynchronous request

        xmlHttp.onload = function () {
            if (xmlHttp.status >= 200 && xmlHttp.status < 300) {
                resolve(xmlHttp.responseText);
            } else {
                reject(new Error(`HTTP request failed with status ${xmlHttp.status}`));
            }
        };

        xmlHttp.onerror = function () {
            reject(new Error('HTTP request failed'));
        };

        xmlHttp.send();
    });
}