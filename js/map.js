// --- Leaflet map: markers, catchment circles and distance lines ---

const map = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView([START_LAT, START_LNG], START_ZOOM);
const tileLayer = L.tileLayer(TILE_URL_DARK, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

let mapCircles = {};
let mapMarkers = {};
let mapLines = [];

function setMapTheme(light) {
    tileLayer.setUrl(light ? TILE_URL_LIGHT : TILE_URL_DARK);
}

function removeLocationLayers(locationId) {
    if (mapMarkers[locationId]) {
        map.removeLayer(mapMarkers[locationId]);
        delete mapMarkers[locationId];
    }
    if (mapCircles[locationId]) {
        map.removeLayer(mapCircles[locationId]);
        delete mapCircles[locationId];
    }
}

function clearDistanceLines() {
    mapLines.forEach(l => map.removeLayer(l));
    mapLines = [];
}

function clearMapLayers() {
    Object.values(mapMarkers).forEach(m => map.removeLayer(m));
    Object.values(mapCircles).forEach(c => map.removeLayer(c));
    mapMarkers = {};
    mapCircles = {};
    clearDistanceLines();
}

function getMarkerSize(vol, isSelected) {
    const scaleFactor = Math.max(0, Math.min(1, (vol - scaleMinVol) / (scaleMaxVol - scaleMinVol)));
    const size = MARKER_MIN_PX + scaleFactor * (MARKER_MAX_PX - MARKER_MIN_PX);
    return isSelected ? size + 6 : size;
}

function drawDistanceLines() {
    clearDistanceLines();

    activeLocationIds.forEach(activeId => {
        const active = findLocation(activeId);
        if (!active) return;

        locations.forEach(neighbor => {
            if (neighbor.id === activeId) return;
            const distKm = getDistanceKm(active.lat, active.lng, neighbor.lat, neighbor.lng);
            if (distKm > DMAX) return;

            const compColor = getRootComp(neighbor.comp).color;
            mapLines.push(L.polyline([[active.lat, active.lng], [neighbor.lat, neighbor.lng]], {
                color: compColor, weight: 2.5, opacity: 0.6, dashArray: '4, 8', interactive: false
            }).addTo(map));

            const midpoint = [(active.lat + neighbor.lat) / 2, (active.lng + neighbor.lng) / 2];
            const labelIcon = L.divIcon({
                html: `<div class="distance-label" style="color: ${compColor};">${distKm.toFixed(2)} km</div>`,
                className: '',
                iconSize: [0, 0]
            });
            mapLines.push(L.marker(midpoint, { icon: labelIcon, interactive: false }).addTo(map));
        });
    });
}

function updateLocationVisuals() {
    locations.forEach(n => {
        const nRoot = getRootComp(n.comp);
        const isWarn = isLocationWarning(n);
        const isSel = activeLocationIds.includes(n.id);
        const cColor = isWarn ? WARNING_COLOR : nRoot.color;

        const circle = mapCircles[n.id];
        if (circle) {
            circle.setRadius(DMAX * 1000);
            circle.setStyle({ color: cColor, fillColor: cColor, opacity: isSel ? 1 : 0, fillOpacity: isSel ? (isWarn ? 0.2 : 0.08) : 0, weight: isWarn ? 2 : 1 });
        }

        const coreEl = document.getElementById(`core-${n.id}`);
        if (!coreEl) return;

        const nSize = getMarkerSize(n.vol, isSel);
        coreEl.style.width = `${nSize}px`;
        coreEl.style.height = `${nSize}px`;
        coreEl.style.backgroundColor = nRoot.color;
        coreEl.style.border = `${isSel ? 3 : 2}px solid ${isWarn ? WARNING_COLOR : 'var(--marker-border)'}`;
        coreEl.style.boxShadow = `0 0 10px ${isWarn ? WARNING_COLOR : nRoot.color}`;
        coreEl.innerText = siteNumber(n.id);

        const tagEl = document.getElementById(`sharetag-${n.id}`);
        if (tagEl) {
            tagEl.innerText = formatMetric(n, ' Share');
            tagEl.style.opacity = (isSel || alwaysShowShares) ? '1' : '0';
            tagEl.style.top = `-${nSize / 2 + 6}px`;
            tagEl.style.borderColor = nRoot.color;
        }

        const nameTagEl = document.getElementById(`nametag-${n.id}`);
        if (nameTagEl) {
            const safeName = (n.name || '').trim();
            const showName = (isSel || alwaysShowNames) && safeName !== '';
            nameTagEl.innerText = safeName;
            nameTagEl.style.opacity = showName ? '1' : '0';
            nameTagEl.style.padding = showName ? '3px 8px' : '0';
            nameTagEl.style.borderWidth = showName ? '1px' : '0';
            nameTagEl.style.top = `${nSize / 2 + 6}px`;
            nameTagEl.style.borderColor = nRoot.color;
        }
    });
}

function createLocationLayers(loc) {
    const rootColor = getRootComp(loc.comp).color;

    mapCircles[loc.id] = L.circle([loc.lat, loc.lng], {
        radius: DMAX * 1000, color: rootColor, fillColor: rootColor, opacity: 0, fillOpacity: 0, weight: 1, interactive: false
    }).addTo(map);

    // Colours, sizes and labels are filled in by updateLocationVisuals().
    const html = `
        <div class="marker-anchor">
            <div id="core-${loc.id}" class="marker-core">${siteNumber(loc.id)}</div>
            <div id="sharetag-${loc.id}" class="marker-tag share-tag"></div>
            <div id="nametag-${loc.id}" class="marker-tag name-tag"></div>
        </div>`;
    const icon = L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
    const marker = L.marker([loc.lat, loc.lng], { icon, draggable: true }).addTo(map);
    mapMarkers[loc.id] = marker;

    // The location may have been deleted since this marker was created.
    const getLive = () => findLocation(loc.id);

    // Scroll over a marker to adjust its volume.
    L.DomEvent.on(marker.getElement(), 'wheel', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        const live = getLive();
        if (!live || e.deltaY === 0) return;
        live.vol = Math.max(0, live.vol + (e.deltaY < 0 ? WHEEL_VOLUME_STEP : -WHEEL_VOLUME_STEP));
        calculateShares();
        updateLocationVisuals();
        drawDistanceLines();
        renderCards();
    });

    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        toggleSelection(loc.id, e.originalEvent.ctrlKey || e.originalEvent.metaKey);
    });

    marker.on('dragstart', () => {
        if (!activeLocationIds.includes(loc.id)) activeLocationIds = [loc.id];
        renderCards();
        updateLocationVisuals();
        drawDistanceLines();
    });

    marker.on('drag', (e) => {
        const live = getLive();
        if (!live) return;
        const pos = e.target.getLatLng();
        live.lat = pos.lat;
        live.lng = pos.lng;
        mapCircles[loc.id].setLatLng(pos);
        calculateShares();
        updateDataDisplays();
        updateLocationVisuals();
        drawDistanceLines();
    });

    marker.on('dragend', (e) => {
        const live = getLive();
        if (!live) return;
        const pos = e.target.getLatLng();
        live.lat = pos.lat;
        live.lng = pos.lng;
        calculateShares();
        draw();
        updateDataDisplays();
    });
}

function draw() {
    const liveIds = new Set(locations.map(n => n.id));
    Object.keys(mapMarkers).forEach(id => {
        if (!liveIds.has(id)) removeLocationLayers(id);
    });

    locations.forEach(loc => {
        if (!mapMarkers[loc.id]) {
            createLocationLayers(loc);
        } else {
            mapMarkers[loc.id].setLatLng([loc.lat, loc.lng]);
            mapCircles[loc.id].setLatLng([loc.lat, loc.lng]);
        }
    });

    updateLocationVisuals();
    drawDistanceLines();
}
