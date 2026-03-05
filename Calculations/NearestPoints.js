async function getNearestPointsOfFeatureCollectionAndLine(SourceGeometry, NetworkGeometry, UserGeometry){
    let pointFeatures = [];
    
    // Check if source is a network or point
    let sourceIsNetwork = SourceGeometry.features.some(f => 
        f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
    );
    
    let OrginalUserPoints;
    
    if (sourceIsNetwork) {
        // For network source: use deep copy (don't modify original UserGeometry)
        OrginalUserPoints = JSON.parse(JSON.stringify(UserGeometry));
    } else {
        // For point source: use reference (original behavior - modifies UserGeometry)
        OrginalUserPoints = UserGeometry;
        // Add source point to list (will also modify original UserGeometry)
        OrginalUserPoints.features.push(SourceGeometry.features[0]);
    }
    
    // Find nearest points on network for all user points (and source point if it's a point)
    for (let i = 0; i < OrginalUserPoints.features.length; i++){
    
        let PointDistances = [];
    
        for (let k = 0; k < NetworkGeometry.features.length; k++){
    
            let currentPoint = turf.nearestPointOnLine(NetworkGeometry.features[k], OrginalUserPoints.features[i]);
    
            PointDistances.push(currentPoint.properties.dist);
        }
    
        let nereastIndex = PointDistances.indexOf(Math.min.apply(null,PointDistances));
    
        PointDistances = [];
    
        let neastPoint = turf.nearestPointOnLine(NetworkGeometry.features[nereastIndex], OrginalUserPoints.features[i]);
    
        pointFeatures.push(neastPoint);
    }

    return pointFeatures;
}