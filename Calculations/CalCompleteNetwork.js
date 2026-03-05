async function getCompleteNetwork(FragmentedNetwork, ConnectionPoints){

    var NetworkLineList = [];

    for (let net = 0; net < FragmentedNetwork.features.length; net++){

        NetworkLineList.push(FragmentedNetwork.features[net]);
    }

    //GetPointList

    var PointList = [];

    for (let poi = 0; poi < ConnectionPoints.features.length; poi++){

        PointList.push(ConnectionPoints.features[poi]);
    }

    var ListCounter = 0;

    var MinimalNetwork = [];

    var FoundPointOnLine = false;

    while (ListCounter < NetworkLineList.length) {

        var NetworkLine = NetworkLineList[ListCounter];

        for (let p = 0; p < PointList.length; p++){

            var point = PointList[p];

            var PointDistance = turf.pointToLineDistance(point, NetworkLine);

            if(PointDistance < 0.00000000001){

                var pointCoords = point.geometry.coordinates;
                var lineCoords = NetworkLine.geometry.coordinates;

                var isOnLineSegment = isPointOnLineSegment(pointCoords, lineCoords);

                if(!isOnLineSegment){

                    var NewLine1 = turf.lineString([pointCoords, lineCoords[0]]);
                    var NewLine2 = turf.lineString([pointCoords, lineCoords[1]]);
    
                    NetworkLineList.push(NewLine1);
                    NetworkLineList.push(NewLine2);

                    FoundPointOnLine = true;
                    break;

                }
            }
        }

        if(!FoundPointOnLine){
            MinimalNetwork.push(NetworkLine);
        }

        FoundPointOnLine = false;

        ListCounter++;
    }

    var MinimalNetworkFeature = turf.featureCollection(MinimalNetwork);

    return MinimalNetworkFeature;

}

function isPointOnLineSegment(pointCoords, lineCoords) {
    var distanceFromStart = turf.distance(turf.point(lineCoords[0]), turf.point(pointCoords));
    var distanceFromEnd = turf.distance(turf.point(lineCoords[lineCoords.length - 1]), turf.point(pointCoords));

    return distanceFromStart === 0 || distanceFromEnd === 0;
}