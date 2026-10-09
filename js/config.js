// --- Static configuration: map defaults, limits, palette, demo names and inline icons ---

const START_LAT = 51.514771;
const START_LNG = -0.076981;
const START_ZOOM = 12;

const TILE_URL_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_URL_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const MAX_COMPANIES = 10;
const DEFAULT_VOLUME = 100;
const WHEEL_VOLUME_STEP = 10;
const WARNING_COLOR = '#ef4444';
const MARKER_MIN_PX = 16;
const MARKER_MAX_PX = 80;
const GEOCODE_BATCH_SIZE = 100;

const companyColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#f43f5e', '#6366f1', '#f97316', '#14b8a6'];
const fakeNames = ['Aperture Sci.', 'Stark Ind.', 'SprawlMart', 'Buy n Large', 'Initech', 'Soylent Corp', 'Globex', 'Umbrella Corp', 'Acme Corp.', 'Wayne Ent.'];

const iconChain = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
const iconBrokenChain = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 1 1 0 10h-2"></path><line x1="8" y1="12" x2="16" y2="12"></line><line x1="2" y1="2" x2="22" y2="22"></line></svg>`;
const iconDelete = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const iconWarning = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
