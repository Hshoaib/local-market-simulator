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
document.getElementById('btnConfirmPostcode').onclick = placePendingLocation;
document.getElementById('btnProcessCsv').onclick = importCsv;

// --- Settings ---
const settingInputs = {
    useWeighting: document.getElementById('settingUseWeighting'),
    minVol: document.getElementById('settingMinVol'),
    maxVol: document.getElementById('settingMaxVol'),
    names: document.getElementById('settingNames'),
    shares: document.getElementById('settingShares'),
    lightMode: document.getElementById('settingLightMode')
};

document.getElementById('btnSettings').onclick = () => {
    settingInputs.useWeighting.checked = useDistanceWeighting;
    settingInputs.minVol.value = scaleMinVol;
    settingInputs.maxVol.value = scaleMaxVol;
    settingInputs.names.checked = alwaysShowNames;
    settingInputs.shares.checked = alwaysShowShares;
    settingInputs.lightMode.checked = isLightMode;
    openModal('settingsModal');
};

document.getElementById('btnApplySettings').onclick = () => {
    useDistanceWeighting = settingInputs.useWeighting.checked;
    alwaysShowNames = settingInputs.names.checked;
    alwaysShowShares = settingInputs.shares.checked;
    isLightMode = settingInputs.lightMode.checked;

    if (isLightMode) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    setMapTheme(isLightMode);

    const newMin = parseFloat(settingInputs.minVol.value);
    const newMax = parseFloat(settingInputs.maxVol.value);
    if (!isNaN(newMin)) scaleMinVol = newMin;
    if (!isNaN(newMax)) scaleMaxVol = newMax;
    if (scaleMinVol >= scaleMaxVol) scaleMaxVol = scaleMinVol + 1;

    closeModals();
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

makeHoldable('btnDistMinus', () => {
    if (DMAX > 1) {
        DMAX -= 1;
        onRadiusChange();
    }
});

makeHoldable('btnDistPlus', () => {
    DMAX += 1;
    onRadiusChange();
});

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
