// --- Travel-time routing via OpenRouteService (each visitor supplies their own API key) ---
//
// Results are cached by travel mode + coordinates rather than location id. They survive a
// location changing owner or id, are reused when a scenario is rebuilt, and a moved location
// simply has no cached data (shows as pending) until the next refresh.

const travelTimeCache = new Map();    // "mode|from|to" -> minutes (Infinity when no route)
const isochroneCache = new Map();     // "mode|mins|point" -> GeoJSON Feature
const routeGeometryCache = new Map(); // "mode|pointA|pointB" (sorted) -> GeoJSON geometry, or null if no route
const unroutablePoints = new Set();   // "mode|point" for points with no road nearby

// Coordinates rounded to ~1 m. Memoised per object so hot loops don't rebuild strings.
const pointKeyMemo = new WeakMap();
function pointKey(p) {
    const memo = pointKeyMemo.get(p);
    if (memo && memo.lat === p.lat && memo.lng === p.lng) return memo.key;
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    pointKeyMemo.set(p, { lat: p.lat, lng: p.lng, key });
    return key;
}

function keyToLngLat(key) {
    const [lat, lng] = key.split(',').map(Number);
    return [lng, lat];
}

const travelKey = (fromKey, toKey, mode = travelMode) => `${mode}|${fromKey}|${toKey}`;
const isochroneKey = (key, mode = travelMode, mins = catchmentMins) => `${mode}|${mins}|${key}`;
const routeKey = (aKey, bKey, mode = travelMode) => `${mode}|${[aKey, bKey].sort().join('|')}`;

function maxReachKm(mode = travelMode, mins = catchmentMins) {
    return TRAVEL_MODES[mode].maxSpeedKmh * mins / 60;
}

function isUnroutable(loc, mode = travelMode) {
    return unroutablePoints.has(`${mode}|${pointKey(loc)}`);
}

// Minutes from one location to another; Infinity if it can't be within the catchment,
// undefined if not fetched yet.
function getTravelMinutes(from, to) {
    const fromKey = pointKey(from);
    const toKey = pointKey(to);
    if (fromKey === toKey) return 0;
    if (isUnroutable(from) || isUnroutable(to)) return Infinity;
    if (getDistanceKm(from.lat, from.lng, to.lat, to.lng) > maxReachKm()) return Infinity;
    return travelTimeCache.get(travelKey(fromKey, toKey));
}

function getIsochrone(loc) {
    return isochroneCache.get(isochroneKey(pointKey(loc)));
}

function getRouteGeometry(a, b) {
    return routeGeometryCache.get(routeKey(pointKey(a), pointKey(b)));
}

// --- What still needs fetching ---

function uniqueRoutablePoints(mode) {
    const keys = new Set();
    locations.forEach(loc => {
        if (!isUnroutable(loc, mode)) keys.add(pointKey(loc));
    });
    return [...keys];
}

function missingIsochrones(keys, mode, mins) {
    return keys.filter(k => !isochroneCache.has(isochroneKey(k, mode, mins)));
}

// Every pair that could be within the largest allowed limit, so changing the limit later
// never leaves results waiting on new travel times.
function missingTravelPairs(keys, mode) {
    const reach = maxReachKm(mode, MAX_CATCHMENT_MINUTES);
    const coords = keys.map(keyToLngLat);
    const pairs = [];
    keys.forEach((from, i) => {
        keys.forEach((to, j) => {
            if (i === j || travelTimeCache.has(travelKey(from, to, mode))) return;
            if (getDistanceKm(coords[i][1], coords[i][0], coords[j][1], coords[j][0]) <= reach) pairs.push([from, to]);
        });
    });
    return pairs;
}

// Unordered pairs within the catchment (either direction) that have no road geometry yet.
function missingRoutes(keys, mode, mins) {
    const pairs = [];
    keys.forEach((a, i) => {
        keys.slice(i + 1).forEach(b => {
            if (routeGeometryCache.has(routeKey(a, b, mode))) return;
            const ab = travelTimeCache.get(travelKey(a, b, mode));
            const ba = travelTimeCache.get(travelKey(b, a, mode));
            if (Math.min(ab ?? Infinity, ba ?? Infinity) <= mins) pairs.push([a, b]);
        });
    });
    return pairs;
}

// Only missing travel times change results, so only they flag a location as needing an update
// (after adding, moving or importing locations, or switching travel mode).
function locationNeedsTravelTimes(loc) {
    return useTravelTime && loc.status === 'pending';
}

// Catchment outlines and road routes are display-only; they load on the next refresh.
function hasMissingTravelVisuals() {
    if (!useTravelTime) return false;
    const keys = uniqueRoutablePoints(travelMode);
    return missingIsochrones(keys, travelMode, catchmentMins).length > 0
        || (drawRoadRoutes && missingRoutes(keys, travelMode, catchmentMins).length > 0);
}

// Covers the missing (from, to) pairs with as few matrix requests as possible: repeatedly take
// the origin row or destination column covering the most uncovered pairs, then pack rows (and
// columns) into requests of at most ORS_MATRIX_MAX_ROUTES routes. Moving one location therefore
// costs about two requests rather than a full re-fetch.
function planMatrixRequests(pairs) {
    const byFrom = new Map();
    const byTo = new Map();
    const addTo = (index, key, value) => {
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(value);
    };
    pairs.forEach(([from, to]) => {
        addTo(byFrom, from, to);
        addTo(byTo, to, from);
    });

    const rows = [];
    const cols = [];
    let remaining = pairs.length;
    while (remaining > 0) {
        let best = null;
        byFrom.forEach((set, key) => { if (!best || set.size > best.set.size) best = { key, set, isRow: true }; });
        byTo.forEach((set, key) => { if (set.size > best.set.size) best = { key, set, isRow: false }; });

        const others = [...best.set];
        (best.isRow ? rows : cols).push({ key: best.key, others });
        others.forEach(other => {
            const [from, to] = best.isRow ? [best.key, other] : [other, best.key];
            byFrom.get(from).delete(to);
            byTo.get(to).delete(from);
            if (byFrom.get(from).size === 0) byFrom.delete(from);
            if (byTo.get(to).size === 0) byTo.delete(to);
            remaining--;
        });
    }

    const pack = (lines, isRow) => {
        const requests = [];
        let fixed = [];
        let union = new Set();
        const flush = () => {
            if (fixed.length === 0) return;
            const spread = [...union];
            requests.push(isRow ? { sources: fixed, destinations: spread } : { sources: spread, destinations: fixed });
            fixed = [];
            union = new Set();
        };
        lines.forEach(line => {
            for (let i = 0; i < line.others.length; i += ORS_MATRIX_MAX_ROUTES) {
                const chunk = line.others.slice(i, i + ORS_MATRIX_MAX_ROUTES);
                const merged = new Set([...union, ...chunk]);
                if (fixed.length > 0 && (fixed.length + 1) * merged.size > ORS_MATRIX_MAX_ROUTES) {
                    flush();
                    chunk.forEach(k => union.add(k));
                } else {
                    union = merged;
                }
                fixed.push(line.key);
            }
        });
        flush();
        return requests;
    };

    return [...pack(rows, true), ...pack(cols, false)];
}

// --- OpenRouteService client ---

class RoutingError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
class RoutingCancelled extends Error {}

// State of the current refresh, read by the toolbar button.
const routingRun = { active: false, cancelled: false, remaining: 0, status: '' };

function setRoutingProgress(changes) {
    Object.assign(routingRun, changes);
    updateRefreshButton();
}

function throwIfCancelled() {
    if (routingRun.cancelled) throw new RoutingCancelled();
}

const RATE_WINDOW_MS = 60000;
const requestLog = { matrix: [], isochrones: [], directions: [] };

// Sliding one-minute window per endpoint, shared across refreshes.
async function waitForRateLimit(endpoint) {
    const log = requestLog[endpoint];
    for (;;) {
        throwIfCancelled();
        const now = Date.now();
        while (log.length && now - log[0] >= RATE_WINDOW_MS) log.shift();
        if (log.length < ORS_RATE_LIMITS[endpoint]) {
            log.push(now);
            return;
        }
        const waitMs = RATE_WINDOW_MS - (now - log[0]) + 250;
        setRoutingProgress({ status: `Waiting ${Math.ceil(waitMs / 1000)}s for the ${endpoint} rate limit` });
        await new Promise(r => setTimeout(r, Math.min(waitMs, 1000))); // Re-check each second so cancel is responsive
    }
}

function describeOrsError(status, detail) {
    if (status === 401 || status === 403) return 'OpenRouteService rejected the API key. Check it in Settings.';
    if (status === 429) return 'OpenRouteService quota reached (per-minute or daily limit). Results fetched so far are kept; try again later.';
    return `OpenRouteService error ${status}${detail ? `: ${detail}` : ''}`;
}

async function orsPost(endpoint, path, body) {
    await waitForRateLimit(endpoint);
    setRoutingProgress({ status: 'Fetching travel data…' });
    let res;
    try {
        res = await fetch(`${ORS_BASE_URL}/${path}`, {
            method: 'POST',
            headers: { 'Authorization': orsApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json, application/geo+json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new RoutingError('Could not reach OpenRouteService. Check your internet connection.', 0);
    } finally {
        setRoutingProgress({ remaining: Math.max(0, routingRun.remaining - 1) });
    }
    if (res.ok) return res.json();
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch (err) { /* Non-JSON error body */ }
    throw new RoutingError(describeOrsError(res.status, detail), res.status);
}

// ORS answers 4xx/500 when a point has no road within ~350 m for the travel mode.
const isPointError = err => err instanceof RoutingError && [400, 404, 500].includes(err.status);

// The current limit plus its neighbours (up to ORS_ISOCHRONE_MAX_RANGES), so stepping the
// limit a few minutes either way reuses outlines from the same request.
function isochroneRanges(mins) {
    const count = Math.min(ORS_ISOCHRONE_MAX_RANGES, MAX_CATCHMENT_MINUTES);
    const start = Math.max(1, Math.min(mins - 4, MAX_CATCHMENT_MINUTES - count + 1));
    return Array.from({ length: count }, (_, i) => start + i);
}

async function fetchIsochrones(keys, mode, mins) {
    try {
        const ranges = isochroneRanges(mins);
        const data = await orsPost('isochrones', `isochrones/${mode}`, { locations: keys.map(keyToLngLat), range: ranges.map(m => m * 60), range_type: 'time' });
        data.features.forEach(feature => {
            const key = keys[feature.properties.group_index];
            const minutes = Math.round(feature.properties.value / 60);
            if (key) isochroneCache.set(isochroneKey(key, mode, minutes), feature);
        });
    } catch (err) {
        if (!isPointError(err)) throw err;
        if (keys.length === 1) {
            unroutablePoints.add(`${mode}|${keys[0]}`);
            return;
        }
        // One bad point fails the whole batch, so retry individually to find it.
        setRoutingProgress({ remaining: routingRun.remaining + keys.length });
        for (const key of keys) await fetchIsochrones([key], mode, mins);
    }
}

async function fetchMatrix({ sources, destinations }, mode) {
    const keys = [...new Set([...sources, ...destinations])];
    const index = new Map(keys.map((k, i) => [k, i]));
    const data = await orsPost('matrix', `matrix/${mode}`, {
        locations: keys.map(keyToLngLat),
        sources: sources.map(k => index.get(k)),
        destinations: destinations.map(k => index.get(k)),
        metrics: ['duration']
    });
    sources.forEach((from, i) => destinations.forEach((to, j) => {
        if (from === to) return;
        const seconds = data.durations[i][j];
        travelTimeCache.set(travelKey(from, to, mode), seconds === null ? Infinity : seconds / 60);
    }));
}

async function fetchRoute([a, b], mode) {
    let geometry = null;
    try {
        const data = await orsPost('directions', `directions/${mode}/geojson`, { coordinates: [keyToLngLat(a), keyToLngLat(b)] });
        geometry = data.features[0]?.geometry || null;
    } catch (err) {
        if (!isPointError(err)) throw err;
    }
    routeGeometryCache.set(routeKey(a, b, mode), geometry);
}

// Minutes the queued requests will take given the per-minute limits (the first minute is free).
function estimateMinutes(counts) {
    return Object.entries(counts).reduce((sum, [endpoint, n]) => sum + Math.max(0, Math.ceil(n / ORS_RATE_LIMITS[endpoint]) - 1), 0);
}

// Fetches everything missing for the current travel mode and limit: catchment polygons
// (which also detects unroutable points), travel times, then optional road routes.
// Clicking the button again while running cancels; results so far are kept.
async function refreshTravelData() {
    if (routingRun.active) {
        setRoutingProgress({ cancelled: true, status: 'Stopping…' });
        return;
    }
    if (!useTravelTime) return;
    if (!orsApiKey) {
        alert('Add your free OpenRouteService API key in Settings to fetch travel times.');
        return;
    }

    const mode = travelMode;
    const mins = catchmentMins;
    const unroutableBefore = unroutablePoints.size;

    const isoBatches = [];
    const isoNeeded = missingIsochrones(uniqueRoutablePoints(mode), mode, mins);
    for (let i = 0; i < isoNeeded.length; i += ORS_ISOCHRONE_MAX_LOCATIONS) isoBatches.push(isoNeeded.slice(i, i + ORS_ISOCHRONE_MAX_LOCATIONS));
    const matrixEstimate = planMatrixRequests(missingTravelPairs(uniqueRoutablePoints(mode), mode)).length;
    if (isoBatches.length + matrixEstimate === 0 && !drawRoadRoutes) return;

    const counts = { isochrones: isoBatches.length, matrix: matrixEstimate };
    const estMins = estimateMinutes(counts);
    const overDaily = Object.entries(counts).filter(([endpoint, n]) => n > ORS_DAILY_LIMITS[endpoint]).map(([endpoint]) => endpoint);
    if (estMins > 0 || overDaily.length > 0) {
        const lines = [
            `This refresh needs about ${counts.isochrones} catchment and ${counts.matrix} travel-time requests${drawRoadRoutes ? ', plus road routes' : ''}.`,
            estMins > 0 ? `To stay within OpenRouteService's per-minute limits it will take about ${estMins} minute(s). Keep this tab open; click the refresh button again to stop.` : '',
            overDaily.length ? `This exceeds the free daily quota for: ${overDaily.join(', ')}. It will stop when the quota runs out.` : '',
            'Continue?'
        ];
        if (!confirm(lines.filter(Boolean).join('\n\n'))) return;
    }

    const startedAt = Date.now();
    setRoutingProgress({ active: true, cancelled: false, remaining: counts.isochrones + counts.matrix, status: 'Fetching travel data…' });
    let errorMessage = null;

    try {
        for (const batch of isoBatches) {
            await fetchIsochrones(batch, mode, mins);
        }
        refresh();

        // Re-plan now that unroutable points are known, so they're left out of the matrix.
        const matrixRequests = planMatrixRequests(missingTravelPairs(uniqueRoutablePoints(mode), mode));
        setRoutingProgress({ remaining: matrixRequests.length });
        for (const request of matrixRequests) {
            await fetchMatrix(request, mode);
        }
        refresh();

        if (drawRoadRoutes) {
            const routes = missingRoutes(uniqueRoutablePoints(mode), mode, mins);
            setRoutingProgress({ remaining: routes.length });
            for (const pair of routes) {
                await fetchRoute(pair, mode);
            }
        }
    } catch (err) {
        if (!(err instanceof RoutingCancelled)) errorMessage = err instanceof RoutingError ? err.message : 'Unexpected error while fetching travel data.';
        if (!(err instanceof RoutingError) && !(err instanceof RoutingCancelled)) console.error(err);
    } finally {
        setRoutingProgress({ active: false, cancelled: false, remaining: 0, status: '' });
        refresh();
    }

    const messages = [];
    if (errorMessage) messages.push(errorMessage);
    const newUnroutable = unroutablePoints.size - unroutableBefore;
    if (newUnroutable > 0) messages.push(`${newUnroutable} location(s) have no road within ~350 m for this travel mode and are shown as "N/A".`);
    if (!errorMessage && Date.now() - startedAt > RATE_WINDOW_MS) messages.push('Travel data refresh complete.');
    if (messages.length) alert(messages.join('\n\n'));
}
