async function getFragmentedLineNetwork(NetworkGeometry, lines){

    var FragmentedLineNetwork = [];
    
    NetworkGeometry.features.forEach(function(feature) {
        FragmentedLineNetwork.push(feature.geometry);
    });
    
    lines.features.forEach(function(feature) {
        FragmentedLineNetwork.push(feature.geometry);
    });
    
    var segments = [];
    
    for (var k = 0; k < FragmentedLineNetwork.length; k++){
        var geometry = FragmentedLineNetwork[k];
        var coordinates = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates];
    
        for (var j = 0; j < coordinates.length; j++) {
            var lineString = coordinates[j];
    
            for (var i = 0; i < lineString.length - 1; i++) {
                var startPoint = lineString[i];
                var endPoint = lineString[i + 1];
        
                var segment = turf.lineString([startPoint, endPoint]);
                segments.push(segment);
            }
        }
    }

    var Output = turf.featureCollection(segments);
    
    return Output;
    
}