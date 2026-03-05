function connectPoints(orginalPointFeatures, newPointFeatures) {
    var lines = [];
    
    for (var i = 0; i < orginalPointFeatures.features.length; i++) {
        var originalPoint = orginalPointFeatures.features[i];
        var newPoint = newPointFeatures.features[i];

        var line = turf.lineString([originalPoint.geometry.coordinates, newPoint.geometry.coordinates]);
        
        lines.push(line);
    }
    
    return turf.featureCollection(lines);
}