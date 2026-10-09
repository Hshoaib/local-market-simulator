// --- Application state and company/location helpers ---

// Browser storage can be unavailable (private browsing, blocked third-party iframes).
function readStorage(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
}
function writeStorage(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch (err) { /* Not persisted */ }
}

// Settings
let useDistanceWeighting = true;
let scaleMinVol = 0;
let scaleMaxVol = 500;
let alwaysShowNames = true;
let alwaysShowShares = false;
let showMarkerNumbers = false;
let isLightMode = false;

// Travel-time routing
let useTravelTime = false;
let travelMode = 'driving-car';
let drawRoadRoutes = false;
// Per travel mode: skip pairs further apart than this (km, straight line) at the maximum limit.
let pairCutoffKm = Object.fromEntries(Object.entries(TRAVEL_MODES).map(([mode, cfg]) => [mode, cfg.defaultCutoffKm]));
let rememberOrsKey = readStorage(STORAGE_REMEMBER_KEY) === 'true';
let orsApiKey = rememberOrsKey ? (readStorage(STORAGE_ORS_KEY) || '') : '';

// Market parameters
let calcMode = 'share'; // 'share' or 'fascia'
let shareThreshold = 35;
let fasciaThreshold = 4;
let catchmentKm = 10;   // Straight-line catchment radius
let catchmentMins = 10; // Travel-time catchment limit

// Scenario data. Each location also carries computed share, fasciaCount and
// status ('ok' | 'pending' while travel times are missing | 'unroutable').
let activeCompanies = [];
let locations = [];
let pendingMergeCompId = null;
let activeLocationIds = [];
let pendingPostcodeCompId = null;

function findCompany(compId) {
    return activeCompanies.find(c => c.id === compId);
}

function findLocation(locationId) {
    return locations.find(n => n.id === locationId);
}

// Location ids look like "<companyId>X<siteNumber>"
function siteNumber(locationId) {
    return locationId.split('X')[1];
}

function getRootComp(compId) {
    let comp = findCompany(compId);
    while (comp && comp.mergedInto) {
        comp = findCompany(comp.mergedInto);
    }
    return comp;
}

function getGroupedCompanies() {
    const rootIdOf = new Map(activeCompanies.map(c => [c.id, getRootComp(c.id).id]));
    return activeCompanies
        .filter(c => !c.mergedInto)
        .map(root => ({ root, members: activeCompanies.filter(c => rootIdOf.get(c.id) === root.id) }));
}

function getUniqueName() {
    const usedNames = activeCompanies.map(c => c.name);
    const available = fakeNames.filter(n => !usedNames.includes(n));
    return available.length === 0 ? fakeNames[0] : available[Math.floor(Math.random() * available.length)];
}

function nextCompanyId() {
    return (activeCompanies.length > 0 ? Math.max(...activeCompanies.map(c => c.id)) : 0) + 1;
}

function createCompany(name) {
    const id = nextCompanyId();
    const comp = { id, name, color: companyColors[(id - 1) % companyColors.length], nextSiteId: 1, collapsed: false, mergedInto: null, alias: null };
    activeCompanies.push(comp);
    return comp;
}

function addLocation(comp, lat, lng, { vol = DEFAULT_VOLUME, name = '' } = {}) {
    const loc = { id: `${comp.id}X${comp.nextSiteId++}`, comp: comp.id, vol, lat, lng, name, share: 100, fasciaCount: 1, status: 'ok' };
    locations.push(loc);
    return loc;
}

// Wipes every company, location and selection (map layers included).
// Travel-time caches are keyed by coordinates, so they stay valid and are kept.
function clearScenario() {
    clearMapLayers();
    activeCompanies = [];
    locations = [];
    activeLocationIds = [];
    pendingMergeCompId = null;
    pendingPostcodeCompId = null;
}
