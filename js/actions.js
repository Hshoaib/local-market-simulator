// --- User actions that change the scenario ---

// Recalculate everything and redraw both the map and the sidebar.
function refresh() {
    calculateShares();
    draw();
    renderCards();
}

function toggleSelection(locationId, additive) {
    if (additive) {
        activeLocationIds = activeLocationIds.includes(locationId)
            ? activeLocationIds.filter(id => id !== locationId)
            : [...activeLocationIds, locationId];
    } else {
        const isOnlySelection = activeLocationIds.length === 1 && activeLocationIds[0] === locationId;
        activeLocationIds = isOnlySelection ? [] : [locationId];
    }
    draw();
    renderCards();
}

function toggleMerge(targetId) {
    if (pendingMergeCompId === null) {
        pendingMergeCompId = targetId;
    } else if (pendingMergeCompId === targetId) {
        pendingMergeCompId = null;
    } else {
        const source = findCompany(pendingMergeCompId);
        if (source) source.mergedInto = targetId;
        pendingMergeCompId = null;
        calculateShares();
    }
    draw();
    renderCards();
}

function unmerge(rootId) {
    activeCompanies.forEach(c => {
        if (c.id !== rootId && getRootComp(c.id).id === rootId) c.mergedInto = null;
    });
    const root = findCompany(rootId);
    if (root) root.alias = null;
    refresh();
}

function deleteCompany(compId) {
    activeCompanies.forEach(c => {
        if (c.mergedInto === compId) c.mergedInto = null;
    });
    if (pendingMergeCompId === compId) pendingMergeCompId = null;
    activeCompanies = activeCompanies.filter(c => c.id !== compId);
    locations = locations.filter(n => n.comp !== compId);
    activeLocationIds = activeLocationIds.filter(id => findLocation(id));
    refresh();
}

function deleteLocation(locationId) {
    locations = locations.filter(n => n.id !== locationId);
    activeLocationIds = activeLocationIds.filter(id => id !== locationId);
    refresh();
}

function moveLocationToCompany(locationId, targetCompId) {
    const loc = findLocation(locationId);
    const nextRoot = findCompany(targetCompId);
    if (!loc || !nextRoot || getRootComp(loc.comp).id === targetCompId) return;

    // The location is renumbered under its new owner, so its map layers are rebuilt.
    removeLocationLayers(loc.id);
    const newId = `${nextRoot.id}X${nextRoot.nextSiteId++}`;
    if (activeLocationIds.includes(loc.id)) {
        activeLocationIds = activeLocationIds.filter(id => id !== loc.id);
        activeLocationIds.push(newId);
    }
    loc.comp = nextRoot.id;
    loc.id = newId;
    refresh();
}

// Moves a company card (with any merged members) one place up (-1) or down (+1), swapping it
// with the next card the user can see (cards hidden by the local market view are skipped).
function moveCompanyGroup(rootId, direction, visibleRootIds = null) {
    const groups = getGroupedCompanies();
    const order = groups.map(g => g.root.id);
    const visible = visibleRootIds ? order.filter(id => visibleRootIds.includes(id)) : order;
    const neighbour = visible[visible.indexOf(rootId) + direction];
    if (!visible.includes(rootId) || neighbour === undefined) return;
    const from = order.indexOf(rootId);
    const to = order.indexOf(neighbour);
    [groups[from], groups[to]] = [groups[to], groups[from]];
    activeCompanies = groups.flatMap(g => g.members);
    renderCards();
}

function updateToolbarDisplay() {
    document.getElementById('warnVal').innerText = calcMode === 'share' ? `${shareThreshold}%` : `${fasciaThreshold}`;
    document.getElementById('distVal').innerText = useTravelTime ? `${catchmentMins} mins` : `${catchmentKm}km`;
}

function setCalcMode(mode) {
    calcMode = mode;
    document.getElementById('iconShareMode').style.display = mode === 'share' ? 'block' : 'none';
    document.getElementById('iconFasciaMode').style.display = mode === 'fascia' ? 'block' : 'none';
    document.getElementById('modeTooltip').innerText = mode === 'share' ? 'Mode: Market Share' : 'Mode: Fascia Count';
    updateToolbarDisplay();
}

function initBaseState() {
    const name = getUniqueName(); // Picked before clearing so it differs from the current companies
    clearScenario();
    setCalcMode('share');

    const comp = createCompany(name);
    addLocation(comp, START_LAT, START_LNG);
    map.setView([START_LAT, START_LNG], START_ZOOM);
    refresh();
}

function shuffleMarket() {
    clearScenario();
    const numComps = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < numComps; i++) createCompany(getUniqueName());

    const center = map.getCenter();
    activeCompanies.forEach(comp => {
        const numLocationsForComp = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numLocationsForComp; i++) {
            const vol = Math.floor(Math.random() * 26 + 5) * 10;
            const lat = center.lat + (Math.random() - 0.5) * 0.15;
            const lng = center.lng + (Math.random() - 0.5) * 0.25;
            addLocation(comp, lat, lng, { vol });
        }
    });
    refresh();
}
