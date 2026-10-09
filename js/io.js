// --- Geocoding, CSV import/export and placing locations by postcode ---

function cleanPostcode(postcode) {
    return postcode.replace(/\s+/g, '').toLowerCase();
}

// Values containing a comma are treated as "lat, lng"; anything else is a postcode.
function isCoordinateString(value) {
    return value.includes(',');
}

function parseLatLng(value) {
    const [lat, lng] = value.split(',').map(parseFloat);
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
}

async function geocodePostcode(postcode) {
    try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode(postcode))}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { lat: data.result.latitude, lng: data.result.longitude, formatted: data.result.postcode };
    } catch (err) {
        return null;
    }
}

// Returns { cleanedPostcode: { lat, lng } } for every postcode that resolved.
async function bulkGeocode(postcodes) {
    const results = {};
    const cleanPostcodes = postcodes.map(cleanPostcode);
    for (let i = 0; i < cleanPostcodes.length; i += GEOCODE_BATCH_SIZE) {
        const batch = cleanPostcodes.slice(i, i + GEOCODE_BATCH_SIZE);
        try {
            const res = await fetch('https://api.postcodes.io/postcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postcodes: batch })
            });
            if (!res.ok) continue;
            const data = await res.json();
            data.result.forEach(item => {
                if (item.result) results[item.query] = { lat: item.result.latitude, lng: item.result.longitude };
            });
        } catch (err) {
            console.error('Bulk geocode failed', err);
        }
    }
    return results;
}

// --- Add a single location (postcode modal) ---

function openPostcodeModal(compId) {
    pendingPostcodeCompId = compId;
    openModal('postcodeModal');
    document.getElementById('postcodeInput').focus();
}

let isPlacingLocation = false;

async function placePendingLocation() {
    if (!pendingPostcodeCompId || isPlacingLocation) return;
    const inputEl = document.getElementById('postcodeInput');
    const loader = document.getElementById('postcodeLoader');
    const val = inputEl.value.trim();
    let coords;

    if (val === '') {
        coords = map.getCenter();
    } else if (isCoordinateString(val)) {
        coords = parseLatLng(val);
        if (!coords) {
            alert('Invalid coordinates.');
            return;
        }
    } else {
        isPlacingLocation = true;
        loader.style.display = 'block';
        coords = await geocodePostcode(val);
        loader.style.display = 'none';
        isPlacingLocation = false;
        if (!coords) {
            alert('Invalid Postcode.');
            return;
        }
    }

    // The company may have been removed while the lookup was in flight.
    const comp = findCompany(pendingPostcodeCompId);
    if (!comp) return;

    if (val !== '') map.flyTo([coords.lat, coords.lng], map.getZoom(), { duration: 1.5 });
    const loc = addLocation(comp, coords.lat, coords.lng);
    activeLocationIds = [loc.id];

    closeModals();
    inputEl.value = '';
    refresh();
}

// --- CSV import ---

let isImportingCsv = false;

function importCsv() {
    const fileInput = document.getElementById('csvFileInput');
    if (!fileInput.files.length) {
        alert('Please select a CSV file.');
        return;
    }
    if (isImportingCsv) return;
    isImportingCsv = true;

    Papa.parse(fileInput.files[0], {
        header: true,
        skipEmptyLines: true,
        error: () => { isImportingCsv = false; },
        complete: async (results) => {
            const fields = results.meta.fields || [];
            if (!fields.includes('Company') || !fields.includes('Location')) {
                isImportingCsv = false;
                alert("Missing 'Company' or 'Location' headers.");
                return;
            }

            const loader = document.getElementById('uploadLoader');
            loader.style.display = 'inline-block';

            const rows = results.data;
            const uniquePostcodes = [...new Set(rows.map(r => r['Location']).filter(Boolean).filter(loc => !isCoordinateString(loc)))];
            const geocoded = uniquePostcodes.length > 0 ? await bulkGeocode(uniquePostcodes) : {};

            const isReplace = document.getElementById('uploadReplace').checked;
            if (isReplace) clearScenario();

            const failedRows = [];
            rows.forEach((row, index) => {
                const rowNum = index + 2; // +1 for the header, +1 for 1-based numbering
                const compName = row['Company']?.trim();
                const locRaw = row['Location']?.trim();
                const name = row['Name']?.trim() || '';
                const rawVol = parseFloat(row['Volume']);
                const vol = isNaN(rawVol) ? DEFAULT_VOLUME : Math.max(0, rawVol);

                if (!compName || !locRaw) {
                    failedRows.push(rowNum);
                    return;
                }

                const coords = isCoordinateString(locRaw) ? parseLatLng(locRaw) : geocoded[cleanPostcode(locRaw)];
                if (!coords) {
                    failedRows.push(rowNum);
                    return;
                }

                const existing = activeCompanies.find(c => c.name.toLowerCase() === compName.toLowerCase());
                const comp = existing ? getRootComp(existing.id) : createCompany(compName);
                addLocation(comp, coords.lat, coords.lng, { vol, name });
            });

            loader.style.display = 'none';
            isImportingCsv = false;
            closeModals();
            fileInput.value = '';
            if (locations.length > 0 && isReplace) map.setView([locations[0].lat, locations[0].lng], 10);
            refresh();
            if (failedRows.length > 0) alert(`Skipped invalid rows: ${failedRows.join(', ')}`);
        }
    });
}

// --- CSV export ---

function saveCsvFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000); // Give the download time to start
}

const companyLabel = comp => comp.alias || comp.name;
const formatLatLng = loc => `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;

// Re-importable list of locations (same columns as the CSV import).
function downloadCsv() {
    const exportData = locations.map(loc => ({
        Company: companyLabel(getRootComp(loc.comp)),
        Location: formatLatLng(loc),
        Name: loc.name || '',
        Volume: loc.vol
    }));
    saveCsvFile(Papa.unparse(exportData), 'simulator_locations_export.csv');
}

const DETAILED_CENTROID_COLUMNS = ['Centroid Site ID', 'Centroid Company', 'Centroid Site Name', 'Centroid Location (Lat Lng)', 'Centroid Volume', 'Centroid Status',
    'Centroid Market Share (%)', 'Centroid Fascia Count', 'Share Alert (Above Threshold)', 'Fascia Alert (Below Threshold)'];
const DETAILED_NEIGHBOR_COLUMNS = ['Neighbor Site ID', 'Neighbor Company', 'Neighbor Site Name', 'Neighbor Location (Lat Lng)', 'Same Owner',
    'Straight-line Distance (km)', 'Travel Time (mins)', 'Weight', 'Neighbor Raw Volume', 'Neighbor Weighted Volume'];

// Settings summary followed by one row per (centroid, neighbour) pair inside each catchment.
function downloadDetailedCsv() {
    const incomplete = locations.filter(n => n.status !== 'ok').length;
    if (incomplete > 0 && !confirm(`${incomplete} location(s) have no result yet (travel times pending or no road access) and will be listed without neighbours. Export anyway?`)) return;

    const unit = catchmentUnit();
    const settingsRows = [
        ['Simulation Export Settings'],
        ['Generated', new Date().toLocaleString()],
        ['Catchment Basis', useTravelTime ? `Travel time (${TRAVEL_MODES[travelMode].label}, OpenRouteService)` : 'Straight-line distance'],
        ['Catchment Limit', `${catchmentLimit()} ${unit}`],
        ['Distance Weighting', useDistanceWeighting ? 'Enabled' : 'Disabled'],
        ['Share Threshold', `${shareThreshold}%`],
        ['Fascia Threshold', fasciaThreshold],
        ['Locations Without Result', incomplete]
    ];

    const rows = [];
    locations.forEach(target => {
        const targetComp = getRootComp(target.comp);
        const ok = target.status === 'ok';
        const centroid = {
            'Centroid Site ID': target.id,
            'Centroid Company': companyLabel(targetComp),
            'Centroid Site Name': target.name || '',
            'Centroid Location (Lat Lng)': formatLatLng(target),
            'Centroid Volume': target.vol,
            'Centroid Status': target.status,
            'Centroid Market Share (%)': ok ? target.share.toFixed(1) : '',
            'Centroid Fascia Count': ok ? target.fasciaCount : '',
            'Share Alert (Above Threshold)': ok ? String(target.share >= shareThreshold).toUpperCase() : '',
            'Fascia Alert (Below Threshold)': ok ? String(target.fasciaCount < fasciaThreshold).toUpperCase() : ''
        };
        if (!ok) {
            rows.push(centroid);
            return;
        }
        forEachInCatchment(target, (neighbor, separation, weight) => {
            const neighborComp = getRootComp(neighbor.comp);
            rows.push({
                ...centroid,
                'Neighbor Site ID': neighbor.id,
                'Neighbor Company': companyLabel(neighborComp),
                'Neighbor Site Name': neighbor.name || '',
                'Neighbor Location (Lat Lng)': formatLatLng(neighbor),
                'Same Owner': String(neighborComp === targetComp).toUpperCase(),
                'Straight-line Distance (km)': getDistanceKm(target.lat, target.lng, neighbor.lat, neighbor.lng).toFixed(2),
                'Travel Time (mins)': useTravelTime ? separation.toFixed(1) : '',
                'Weight': weight.toFixed(3),
                'Neighbor Raw Volume': neighbor.vol,
                'Neighbor Weighted Volume': (weight * neighbor.vol).toFixed(2)
            });
        });
    });

    // Fixed columns, so neighbour columns exist even if no location has a result yet.
    const columns = [...DETAILED_CENTROID_COLUMNS, ...DETAILED_NEIGHBOR_COLUMNS];
    const table = Papa.unparse({ fields: columns, data: rows.map(r => columns.map(c => r[c] ?? '')) });
    const content = `${Papa.unparse(settingsRows)}\r\n\r\n${table}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    saveCsvFile(content, `Detailed_Matrix_Export_${timestamp}.csv`);
}
