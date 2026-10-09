// --- Static configuration: map defaults, limits, palette, demo names and inline icons ---

const START_LAT = 51.514771;
const START_LNG = -0.076981;
const START_ZOOM = 12;

// CARTO basemaps require a key (free tier: carto.com/basemaps/apikey). It is visible client-side by design.
const CARTO_API_KEY = 'cb1_4fci_1_14875698e8f5070f9385d535';
const TILE_URL_DARK = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`;
const TILE_URL_LIGHT = `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`;

const MAX_COMPANIES = 10;
const DEFAULT_VOLUME = 100;
const WHEEL_VOLUME_STEP = 10;
const WARNING_COLOR = '#ef4444';
const MARKER_MIN_PX = 16;
const MARKER_MAX_PX = 80;
const GEOCODE_BATCH_SIZE = 100;
const PENDING_COLOR = '#fbbf24';
const PLACEHOLDER_CATCHMENT_M = 300; // Dashed circle shown while a travel-time catchment outline isn't loaded
const NUDGE_TOLERANCE_PX = 6;        // Marker drags shorter than this snap back (accidental nudge while clicking)

// --- Travel-time routing (OpenRouteService; each visitor supplies their own free key) ---
const ORS_BASE_URL = 'https://api.openrouteservice.org/v2';
const STORAGE_REMEMBER_KEY = 'sim_remember_keys';
const STORAGE_ORS_KEY = 'sim_ors_key';

// Largest travel-time catchment. Travel times are fetched for every pair reachable within
// this, so changing the limit never needs new times.
const MAX_CATCHMENT_MINUTES = 180;

// defaultCutoffKm: straight-line distance beyond which a pair is skipped at the maximum limit
// (scaled down proportionally for shorter limits). Road distance is never shorter than
// straight-line distance, so the defaults are top speed x 3 h: car 130 km/h, HGV 110, cycling 45,
// walking 10 (ORS uses road speed limits; UK max 70 mph). Users can change them in Settings.
// maxOutlineMinutes is the largest catchment outline (isochrone) ORS will draw for the mode.
const TRAVEL_MODES = {
    'driving-car': { label: 'Driving (Car)', defaultCutoffKm: 390, maxOutlineMinutes: 60 },
    'driving-hgv': { label: 'Driving (HGV)', defaultCutoffKm: 330, maxOutlineMinutes: 60 },
    'cycling-regular': { label: 'Cycling (Regular)', defaultCutoffKm: 135, maxOutlineMinutes: MAX_CATCHMENT_MINUTES },
    'foot-walking': { label: 'Walking (Pedestrian)', defaultCutoffKm: 30, maxOutlineMinutes: MAX_CATCHMENT_MINUTES }
};
const MAX_PAIR_CUTOFF_KM = 2000;

// Free "Standard" plan limits: requests per minute (kept just under) and per day.
const ORS_RATE_LIMITS = { matrix: 38, isochrones: 18, directions: 38 };
const ORS_DAILY_LIMITS = { matrix: 500, isochrones: 500, directions: 2000 };
const ORS_MATRIX_MAX_ROUTES = 3500;       // sources x destinations per request
const ORS_ISOCHRONE_MAX_LOCATIONS = 5;    // locations per request
const ORS_ISOCHRONE_MAX_RANGES = 10;      // time ranges per request

const companyColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#f43f5e', '#6366f1', '#f97316', '#14b8a6'];
const fakeNames = ['Aperture Sci.', 'Stark Ind.', 'SprawlMart', 'Buy n Large', 'Initech', 'Soylent Corp', 'Globex', 'Umbrella Corp', 'Acme Corp.', 'Wayne Ent.'];

const iconChain = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
const iconBrokenChain = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 1 1 0 10h-2"></path><line x1="8" y1="12" x2="16" y2="12"></line><line x1="2" y1="2" x2="22" y2="22"></line></svg>`;
const iconDelete = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const iconWarning = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
const iconChevronUp = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
const iconChevronDown = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
