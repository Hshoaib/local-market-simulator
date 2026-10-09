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

function isLocationWarning(loc) {
    return calcMode === 'share' ? loc.share >= shareThreshold : loc.fasciaCount < fasciaThreshold;
}

function formatMetric(loc, shareSuffix = '') {
    return calcMode === 'share' ? `${loc.share.toFixed(1)}%${shareSuffix}` : `${loc.fasciaCount} Fascias`;
}

function calculateShares() {
    // Resolve each location's owning (root) company once, rather than per pair.
    const rootIds = locations.map(n => getRootComp(n.comp).id);

    locations.forEach((target, i) => {
        let num = 0;
        let den = 0;
        const uniqueFascias = new Set();

        locations.forEach((neighbor, j) => {
            const distKm = getDistanceKm(target.lat, target.lng, neighbor.lat, neighbor.lng);
            if (distKm > DMAX) return;

            uniqueFascias.add(rootIds[j]);
            const weight = useDistanceWeighting ? (DMAX - distKm) / DMAX : 1;
            const weightedVol = weight * neighbor.vol;
            den += weightedVol;
            if (rootIds[i] === rootIds[j]) num += weightedVol;
        });

        target.share = den > 0 ? (num / den) * 100 : 100;
        target.fasciaCount = uniqueFascias.size;
    });
}
