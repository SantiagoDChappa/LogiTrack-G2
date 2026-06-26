// Point-in-polygon sin dependencias (ray casting). Coordenadas en formato GeoJSON
// [lng, lat]. Usado para validar que el destino de un envío (lat/long) caiga dentro
// de un área marcada como peligrosa / no llegable.

// ¿El punto está dentro del anillo (array de [lng,lat])? Algoritmo even-odd.
function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
        if (intersect) { inside = !inside; }
    }
    return inside;
}

// polygon = [outerRing, hole1, hole2, ...] (formato GeoJSON Polygon.coordinates)
function pointInPolygon(lng, lat, polygon) {
    if (!polygon || !polygon.length) { return false; }
    if (!pointInRing(lng, lat, polygon[0])) { return false; }     // fuera del contorno
    for (let h = 1; h < polygon.length; h++) {
        if (pointInRing(lng, lat, polygon[h])) { return false; }  // dentro de un agujero
    }
    return true;
}

// geom = GeoJSON geometry (Polygon | MultiPolygon | Feature | {geometry})
function pointInGeometry(lng, lat, geom) {
    if (lng === null || lng === undefined || lat === null || lat === undefined || !geom) { return false; }
    if (geom.geometry) { geom = geom.geometry; }
    if (geom.type === 'Polygon') {
        return pointInPolygon(lng, lat, geom.coordinates);
    }
    if (geom.type === 'MultiPolygon') {
        return (geom.coordinates || []).some(poly => pointInPolygon(lng, lat, poly));
    }
    return false;
}

module.exports = { pointInRing, pointInPolygon, pointInGeometry };
