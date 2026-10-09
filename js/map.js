// --- Leaflet map: markers, catchment shapes and distance lines ---

const map = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView([START_LAT, START_LNG], START_ZOOM);
const tileLayer = L.tileLayer(TILE_URL_DARK, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &middot; Routing &copy; <a href="https://openrouteservice.org">openrouteservice</a>'
}).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

let mapMarkers = {};
let mapCatchments = {}; // id -> { key, layer }: a radius circle, an isochrone polygon, or a pending placeholder
let mapLines = [];

const HIDDEN_STYLE = { opacity: 0, fillOpacity: 0, weight: 1 };

function setMapTheme(light) {
    tileLayer.setUrl(light ? TILE_URL_LIGHT : TILE_URL_DARK);
}

function removeLocationLayers(locationId) {
    if (mapMarkers[locationId]) {
        map.removeLayer(mapMarkers[locationId]);
        delete mapMarkers[locationId];
    }
    if (mapCatchments[locationId]) {
        map.removeLayer(mapCatchments[locationId].layer);
        delete mapCatchments[locationId];
    }
}

function clearDistanceLines() {
    mapLines.forEach(l => map.removeLayer(l));
    mapLines = [];
}

function clearMapLayers() {
    Object.values(mapMarkers).forEach(m => map.removeLayer(m));
    Object.values(mapCatchments).forEach(c => map.removeLayer(c.layer));
    mapMarkers = {};
    mapCatchments = {};
    clearDistanceLines();
}

function getMarkerSize(vol, isSelected) {
    const scaleFactor = Math.max(0, Math.min(1, (vol - scaleMinVol) / (scaleMaxVol - scaleMinVol)));
    const size = MARKER_MIN_PX + scaleFactor * (MARKER_MAX_PX - MARKER_MIN_PX);
    return isSelected ? size + 6 : size;
}

// Creates or swaps the location's catchment layer when the kind of shape it needs changes.
function syncCatchmentLayer(loc) {
    let key = 'circle';
    let isochrone = null;
    if (useTravelTime) {
        isochrone = getIsochrone(loc);
        key = isochrone ? isochroneKey(pointKey(loc)) : 'placeholder';
    }

    const current = mapCatchments[loc.id];
    if (current && current.key === key) {
        if (!isochrone) current.layer.setLatLng([loc.lat, loc.lng]);
        return;
    }
    if (current) map.removeLayer(current.layer);

    const layer = isochrone
        ? L.geoJSON(isochrone, { interactive: false, style: HIDDEN_STYLE })
        : L.circle([loc.lat, loc.lng], { radius: key === 'circle' ? catchmentKm * 1000 : PLACEHOLDER_CATCHMENT_M, interactive: false, ...HIDDEN_STYLE });
    mapCatchments[loc.id] = { key, layer: layer.addTo(map) };
}

// Middle vertex of a route, so the label sits on the road rather than the straight midpoint.
function routeMidpoint(geometry) {
    const coords = geometry.coordinates;
    const [lng, lat] = coords[Math.floor(coords.length / 2)];
    return [lat, lng];
}

function drawDistanceLines() {
    clearDistanceLines();
    const limit = catchmentLimit();

    activeLocationIds.forEach(activeId => {
        const active = findLocation(activeId);
        if (!active) return;

        locations.forEach(neighbor => {
            if (neighbor.id === activeId) return;
            const separation = getSeparation(active, neighbor);
            if (separation === undefined || separation > limit) return;

            const compColor = getRootComp(neighbor.comp).color;
            const geometry = useTravelTime && drawRoadRoutes ? getRouteGeometry(active, neighbor) : null;
            let midpoint;
            if (geometry) {
                mapLines.push(L.geoJSON(geometry, {
                    interactive: false, style: { color: compColor, weight: 3.5, opacity: 0.8, dashArray: '5, 10' }
                }).addTo(map));
                midpoint = routeMidpoint(geometry);
            } else {
                mapLines.push(L.polyline([[active.lat, active.lng], [neighbor.lat, neighbor.lng]], {
                    color: compColor, weight: 2.5, opacity: 0.6, dashArray: '4, 8', interactive: false
                }).addTo(map));
                midpoint = [(active.lat + neighbor.lat) / 2, (active.lng + neighbor.lng) / 2];
            }

            const label = useTravelTime ? `${separation.toFixed(1)} mins` : `${separation.toFixed(2)} km`;
            const labelIcon = L.divIcon({
                html: `<div class="distance-label" style="color: ${compColor};">${label}</div>`,
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

        const catchment = mapCatchments[n.id];
        if (catchment) {
            const isPlaceholder = catchment.key === 'placeholder';
            const cColor = isWarn ? WARNING_COLOR : (isPlaceholder ? '#94a3b8' : nRoot.color);
            if (catchment.key === 'circle') catchment.layer.setRadius(catchmentKm * 1000);
            catchment.layer.setStyle({
                color: cColor, fillColor: cColor, opacity: isSel ? 1 : 0, fillOpacity: isSel ? (isWarn ? 0.2 : 0.08) : 0,
                weight: isWarn ? 2 : 1, dashArray: isPlaceholder ? '5, 5' : null
            });
        }

        const coreEl = document.getElementById(`core-${n.id}`);
        if (!coreEl) return;

        const nSize = getMarkerSize(n.vol, isSel);
        coreEl.style.width = `${nSize}px`;
        coreEl.style.height = `${nSize}px`;
        coreEl.style.backgroundColor = nRoot.color;
        coreEl.style.border = `${isSel ? 3 : 2}px solid ${isWarn ? WARNING_COLOR : 'var(--marker-border)'}`;
        coreEl.style.boxShadow = `0 0 10px ${isWarn ? WARNING_COLOR : nRoot.color}`;
        coreEl.innerText = showMarkerNumbers ? siteNumber(n.id) : '';

        const tagEl = document.getElementById(`sharetag-${n.id}`);
        if (tagEl) {
            const isOk = n.status === 'ok';
            tagEl.innerText = formatMetric(n, true);
            tagEl.style.opacity = (isSel || alwaysShowShares) ? '1' : '0';
            tagEl.style.top = `-${nSize / 2 + 6}px`;
            tagEl.style.borderColor = isOk ? nRoot.color : PENDING_COLOR;
            tagEl.style.color = isOk ? '' : PENDING_COLOR;
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

    updateRefreshButton();
}

function createMarker(loc) {
    // Colours, sizes and labels are filled in by updateLocationVisuals().
    const html = `
        <div class="marker-anchor">
            <div id="core-${loc.id}" class="marker-core"></div>
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
        calculateShares();
        syncCatchmentLayer(live);
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
        if (!mapMarkers[loc.id]) createMarker(loc);
        else mapMarkers[loc.id].setLatLng([loc.lat, loc.lng]);
        syncCatchmentLayer(loc);
    });

    updateLocationVisuals();
    drawDistanceLines();
}
