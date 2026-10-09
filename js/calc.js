// --- Market share and fascia calculations ---

// Great-circle distance using the Haversine formula.
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// The catchment is a straight-line radius (km) or a travel-time limit (mins).
function catchmentLimit() {
    return useTravelTime ? catchmentMins : catchmentKm;
}

function catchmentUnit() {
    return useTravelTime ? 'mins' : 'km';
}

// Distance (km) or travel time (mins) from one location to another.
// Infinity means it cannot be in the catchment; undefined means the travel time isn't fetched yet.
function getSeparation(from, to) {
    if (from.id === to.id) return 0; // A store is always 0 from itself
    return useTravelTime ? getTravelMinutes(from, to) : getDistanceKm(from.lat, from.lng, to.lat, to.lng);
}

function catchmentWeight(separation) {
    const limit = catchmentLimit();
    return useDistanceWeighting ? (limit - separation) / limit : 1;
}

// Calls fn(neighbor, separation, weight) for every location in target's catchment, itself included.
// Returns false if some separations are still unknown (travel times not fetched).
function forEachInCatchment(target, fn) {
    const limit = catchmentLimit();
    let complete = true;
    locations.forEach(neighbor => {
        const separation = getSeparation(target, neighbor);
        if (separation === undefined) {
            complete = false;
            return;
        }
        if (separation <= limit) fn(neighbor, separation, catchmentWeight(separation));
    });
    return complete;
}

function isLocationWarning(loc) {
    if (loc.status !== 'ok') return false;
    return calcMode === 'share' ? loc.share >= shareThreshold : loc.fasciaCount < fasciaThreshold;
}

// Short form for the sidebar; onMap gives the longer map-label form.
function formatMetric(loc, onMap = false) {
    if (loc.status === 'pending') return onMap ? 'Pending…' : '?';
    if (loc.status === 'unroutable') return onMap ? 'No road access' : 'N/A';
    return calcMode === 'share' ? `${loc.share.toFixed(1)}%${onMap ? ' Share' : ''}` : `${loc.fasciaCount} Fascias`;
}

function calculateShares() {
    // Resolve each company's owning (root) company once, rather than per pair.
    const rootIdOf = new Map(activeCompanies.map(c => [c.id, getRootComp(c.id).id]));

    locations.forEach(target => {
        if (useTravelTime && isUnroutable(target)) {
            target.status = 'unroutable';
            return;
        }

        const targetRoot = rootIdOf.get(target.comp);
        let num = 0;
        let den = 0;
        const uniqueFascias = new Set();

        const complete = forEachInCatchment(target, (neighbor, separation, weight) => {
            const neighborRoot = rootIdOf.get(neighbor.comp);
            const weightedVol = weight * neighbor.vol;
            uniqueFascias.add(neighborRoot);
            den += weightedVol;
            if (neighborRoot === targetRoot) num += weightedVol;
        });

        target.share = den > 0 ? (num / den) * 100 : 100;
        target.fasciaCount = uniqueFascias.size;
        target.status = complete ? 'ok' : 'pending';
    });
}
