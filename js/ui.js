// --- UI wiring: onboarding, modals, settings, toolbar and map events. Loaded last. ---

// --- Onboarding: pulse the key buttons until the user first interacts ---
let onboardingActive = true;
function removeOnboarding() {
    if (!onboardingActive) return;
    onboardingActive = false;
    document.querySelectorAll('.needs-attention').forEach(el => el.classList.remove('needs-attention'));
}
document.addEventListener('click', removeOnboarding, { capture: true, once: true });
map.on('dragstart', removeOnboarding);

// --- Modals ---
function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModals() {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModals(); // Click on the backdrop, not the content
    });
});
document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeModals));

document.getElementById('btnInfo').onclick = () => openModal('infoModal');
document.getElementById('btnHelp').onclick = () => openModal('helpModal');
document.getElementById('btnUpload').onclick = () => openModal('uploadModal');
document.getElementById('btnDownload').onclick = downloadCsv;
document.getElementById('btnExportDetailed').onclick = downloadDetailedCsv;
document.getElementById('btnConfirmPostcode').onclick = placePendingLocation;
document.getElementById('btnProcessCsv').onclick = importCsv;

// --- Settings ---
const settingInputs = {
    useWeighting: document.getElementById('settingUseWeighting'),
    minVol: document.getElementById('settingMinVol'),
    maxVol: document.getElementById('settingMaxVol'),
    names: document.getElementById('settingNames'),
    shares: document.getElementById('settingShares'),
    markerNumbers: document.getElementById('settingMarkerNumbers'),
    lightMode: document.getElementById('settingLightMode'),
    useTravelTime: document.getElementById('settingUseTravelTime'),
    orsKey: document.getElementById('settingOrsApiKey'),
    rememberKey: document.getElementById('settingRememberKey'),
    travelMode: document.getElementById('settingTravelMode'),
    roadRoutes: document.getElementById('settingRoadRoutes')
};
const travelTimeOptions = document.getElementById('travelTimeOptions');

settingInputs.travelMode.innerHTML = Object.entries(TRAVEL_MODES)
    .map(([value, mode]) => `<option value="${value}">${mode.label}</option>`).join('');
settingInputs.useTravelTime.addEventListener('change', () => {
    travelTimeOptions.hidden = !settingInputs.useTravelTime.checked;
});

document.getElementById('btnSettings').onclick = () => {
    settingInputs.useWeighting.checked = useDistanceWeighting;
    settingInputs.minVol.value = scaleMinVol;
    settingInputs.maxVol.value = scaleMaxVol;
    settingInputs.names.checked = alwaysShowNames;
    settingInputs.shares.checked = alwaysShowShares;
    settingInputs.lightMode.checked = isLightMode;
    settingInputs.markerNumbers.checked = showMarkerNumbers;
    settingInputs.useTravelTime.checked = useTravelTime;
    travelTimeOptions.hidden = !useTravelTime;
    settingInputs.orsKey.value = orsApiKey;
    settingInputs.rememberKey.checked = rememberOrsKey;
    settingInputs.travelMode.value = travelMode;
    settingInputs.roadRoutes.checked = drawRoadRoutes;
    openModal('settingsModal');
};

document.getElementById('btnApplySettings').onclick = () => {
    useDistanceWeighting = settingInputs.useWeighting.checked;
    alwaysShowNames = settingInputs.names.checked;
    alwaysShowShares = settingInputs.shares.checked;
    isLightMode = settingInputs.lightMode.checked;
    showMarkerNumbers = settingInputs.markerNumbers.checked;

    // Travel data is cached per mode and position, so switching needs no invalidation.
    useTravelTime = settingInputs.useTravelTime.checked;
    travelMode = settingInputs.travelMode.value;
    drawRoadRoutes = settingInputs.roadRoutes.checked;
    catchmentMins = Math.min(catchmentMins, TRAVEL_MODES[travelMode].maxMinutes);
    orsApiKey = settingInputs.orsKey.value.trim();
    rememberOrsKey = settingInputs.rememberKey.checked;
    writeStorage(STORAGE_REMEMBER_KEY, rememberOrsKey ? 'true' : null);
    writeStorage(STORAGE_ORS_KEY, rememberOrsKey && orsApiKey ? orsApiKey : null);

    if (isLightMode) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    setMapTheme(isLightMode);

    const newMin = parseFloat(settingInputs.minVol.value);
    const newMax = parseFloat(settingInputs.maxVol.value);
    if (!isNaN(newMin)) scaleMinVol = newMin;
    if (!isNaN(newMax)) scaleMaxVol = newMax;
    if (scaleMinVol >= scaleMaxVol) scaleMaxVol = scaleMinVol + 1;

    closeModals();
    updateToolbarDisplay();
    refresh();
};

// --- Bottom toolbar ---
const bottomToolbar = document.getElementById('bottomToolbar');
const btnHelp = document.getElementById('btnHelp');
btnHelp.addEventListener('mouseenter', () => bottomToolbar.classList.add('show-all-tips'));
btnHelp.addEventListener('mouseleave', () => bottomToolbar.classList.remove('show-all-tips'));

document.getElementById('btnCenter').onclick = () => map.setView([START_LAT, START_LNG], START_ZOOM);
document.getElementById('btnReset').onclick = initBaseState;
document.getElementById('btnShuffle').onclick = shuffleMarket;

document.getElementById('btnModeToggle').onclick = () => {
    setCalcMode(calcMode === 'share' ? 'fascia' : 'share');
    updateLocationVisuals();
    renderCards();
};

// Runs the action once on press, then repeatedly while the button is held.
function makeHoldable(btnId, actionFn) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    let timer, interval;
    const start = (e) => {
        if (e.type !== 'touchstart' && e.button !== 0) return;
        e.preventDefault();
        actionFn();
        timer = setTimeout(() => { interval = setInterval(actionFn, 100); }, 400);
    };
    const stop = (e) => {
        if (e) e.preventDefault();
        clearTimeout(timer);
        clearInterval(interval);
    };
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => btn.addEventListener(evt, stop));
}

makeHoldable('btnCompMinus', () => {
    if (activeCompanies.length > 1) deleteCompany(activeCompanies[activeCompanies.length - 1].id);
});

makeHoldable('btnCompPlus', () => {
    if (activeCompanies.length < MAX_COMPANIES) {
        createCompany(getUniqueName());
        renderCards();
    }
});

function onThresholdChange() {
    updateToolbarDisplay();
    updateLocationVisuals();
    renderCards();
}

makeHoldable('btnWarnMinus', () => {
    if (calcMode === 'share' && shareThreshold > 5) shareThreshold -= 5;
    if (calcMode === 'fascia' && fasciaThreshold > 1) fasciaThreshold -= 1;
    onThresholdChange();
});

makeHoldable('btnWarnPlus', () => {
    if (calcMode === 'share' && shareThreshold < 100) shareThreshold += 5;
    if (calcMode === 'fascia' && fasciaThreshold < 20) fasciaThreshold += 1;
    onThresholdChange();
});

function onRadiusChange() {
    updateToolbarDisplay();
    calculateShares();
    draw();
    updateDataDisplays();
}

// Steps the active catchment limit: km for straight-line, minutes for travel time.
function stepCatchment(delta) {
    if (useTravelTime) {
        const next = catchmentMins + delta;
        if (next < 1 || next > TRAVEL_MODES[travelMode].maxMinutes) return;
        catchmentMins = next;
    } else {
        const next = catchmentKm + delta;
        if (next < 1) return;
        catchmentKm = next;
    }
    onRadiusChange();
}

makeHoldable('btnDistMinus', () => stepCatchment(-1));
makeHoldable('btnDistPlus', () => stepCatchment(1));

// --- Travel-time refresh button ---
const btnRefreshTravel = document.getElementById('btnRefreshTravel');
const refreshBadge = document.getElementById('refreshBadge');
const refreshTooltip = document.getElementById('refreshTooltip');
btnRefreshTravel.onclick = refreshTravelData;

function updateRefreshButton() {
    btnRefreshTravel.hidden = !useTravelTime;
    document.getElementById('refreshDivider').hidden = !useTravelTime;
    if (!useTravelTime) return;

    const needing = routingRun.active ? 0 : locations.filter(locationNeedsTravelData).length;
    const count = routingRun.active ? routingRun.remaining : needing;
    refreshBadge.hidden = count === 0;
    refreshBadge.innerText = count;
    refreshBadge.classList.toggle('running', routingRun.active);
    btnRefreshTravel.classList.toggle('running', routingRun.active);

    if (routingRun.active) {
        refreshTooltip.innerText = `${routingRun.status} (${routingRun.remaining} requests left) · click to stop`;
    } else if (!orsApiKey) {
        refreshTooltip.innerText = 'Add an OpenRouteService key in Settings';
    } else {
        refreshTooltip.innerText = needing > 0 ? `Fetch travel times (${needing} location${needing === 1 ? '' : 's'} need updating)` : 'Travel times up to date';
    }
}

// --- Map interactions ---
map.on('click', () => {
    activeLocationIds = [];
    draw();
    renderCards();
});

// Double-click empty map space to drop a location for the first company.
map.on('dblclick', (e) => {
    removeOnboarding();
    if (activeCompanies.length === 0) return;
    const loc = addLocation(activeCompanies[0], e.latlng.lat, e.latlng.lng);
    activeLocationIds = [loc.id];
    refresh();
});

// --- Start ---
initBaseState();
