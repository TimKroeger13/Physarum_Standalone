async function loadData() {

    var fileInput = document.getElementById('fileInput');
    fileInput.click();

    var fileContent = await importFileContent(fileInput);

    const fileType = getFileType(fileInput.files[0].name);

    if (fileType === 'csv') {
        var CsvJson = await convertCsvToGeoJson(fileContent);
        return CsvJson;
    } else if (fileType === 'geojson') {
        var geoJson = JSON.parse(fileContent);
        return geoJson;
    }
    else if (fileType === 'phy') {
        var Json = JSON.parse(fileContent);
        return Json;
    }
}

async function importFileContent(fileInput) {
    return new Promise((resolve, reject) => {
        fileInput.onchange = function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const fileContent = e.target.result;
                    resolve(fileContent);
                };
                reader.onerror = function(error) {
                    reject(error);
                };
                reader.readAsText(file);
            }
        };
    });
}

function getFileType(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    if (extension === 'geojson') {
        return 'geojson';
    } else if (extension === 'csv') {
        return 'csv';
    }else if (extension === 'phy') {
        return 'phy';
    } else {
        return 'unsupported';
    }
}