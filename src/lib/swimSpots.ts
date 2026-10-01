// src/lib/swimSpots.ts
// The swim-spot vocabulary and validation, in one client-safe place.
//
// Not under $lib/server, because all three consumers need it: the map at /meSoup
// colors its dots and builds its legend from the water types, the admin form
// builds its dropdown from the same list, and the API validates writes with
// normalizeSpot() so the form and the endpoint can never disagree about what a
// valid spot is.
//
// The built-in types live here and nowhere else. Types typed in under "Other"
// are stored in swim_water_types and merged in with withCustomTypes(); the
// database holds only those additions, never a copy of the built-ins.

export interface WaterTypeMeta {
	id: string;
	label: string;
	color: string;
}

// Order is the legend's order. `other` stays last; everything else runs roughly
// biggest body of water to smallest, which is also how the colors were chosen --
// blues for open water, warmer as the water gets smaller and more man-made.
export const WATER_TYPES: WaterTypeMeta[] = [
	{ id: 'ocean', label: 'Ocean', color: '#0b62a4' },
	{ id: 'sea', label: 'Sea', color: '#1f93b8' },
	{ id: 'lake', label: 'Lake', color: '#2e9e7a' },
	{ id: 'river', label: 'River', color: '#57a83c' },
	{ id: 'pond', label: 'Pond', color: '#9a8a2e' },
	{ id: 'spring', label: 'Spring', color: '#d08a22' },
	{ id: 'quarry', label: 'Quarry', color: '#8d6247' },
	{ id: 'pool', label: 'Pool', color: '#c8457a' },
	{ id: 'other', label: 'Other', color: '#6b6f76' }
];

export const DEFAULT_WATER_TYPE = 'other';

const OTHER = WATER_TYPES.find((t) => t.id === DEFAULT_WATER_TYPE)!;

// Colors handed to custom types in the order they are created. None of them is
// a built-in color, so a custom dot never reads as a lake or a pool.
export const CUSTOM_TYPE_COLORS = [
	'#7b4fb8',
	'#d9534f',
	'#1a9c9c',
	'#b8860b',
	'#4f6fd9',
	'#a0522d',
	'#3c8d5a',
	'#c05fb0'
];

// The full list: built-ins, then custom types, with `other` still last.
export function withCustomTypes(custom: WaterTypeMeta[]): WaterTypeMeta[] {
	const known = new Set(WATER_TYPES.map((t) => t.id));
	const extra = custom.filter((t) => !known.has(t.id));
	return [...WATER_TYPES.filter((t) => t !== OTHER), ...extra, OTHER];
}

// 'Hot Spring!' -> 'hot-spring'. The id a typed-in type is stored under, so
// "hot spring" and "Hot Spring" land on the same type instead of two.
export function waterTypeId(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// Always returns something. An unknown id can only come from a row written before
// a type was renamed, and a dot with no color is worse than a grey one.
export function waterType(
	id: string | null | undefined,
	types: WaterTypeMeta[] = WATER_TYPES
): WaterTypeMeta {
	return types.find((t) => t.id === id) ?? OTHER;
}

// --- degrees, minutes, seconds ---

export interface Dms {
	d: string;
	m: string;
	s: string;
	hemi: string; // 'N' | 'S' for latitude, 'E' | 'W' for longitude
}

// What a DMS field set holds, turned into signed decimal degrees. The range
// check against ±90/±180 is left to normalizeSpot, so both formats fail with
// the same message.
export function dmsToDecimal(
	dms: Dms,
	axis: 'Latitude' | 'Longitude'
): { ok: true; value: number } | { ok: false; error: string } {
	const part = (v: string) => (v.trim() === '' ? 0 : Number(v));
	if (dms.d.trim() === '') return { ok: false, error: `${axis} needs its degrees.` };
	const d = part(dms.d);
	const m = part(dms.m);
	const s = part(dms.s);
	if (![d, m, s].every(Number.isFinite) || d < 0 || m < 0 || s < 0) {
		return { ok: false, error: `${axis} degrees, minutes and seconds must be positive numbers.` };
	}
	if (m >= 60 || s >= 60) {
		return { ok: false, error: `${axis} minutes and seconds must each be under 60.` };
	}
	const value = d + m / 60 + s / 3600;
	return { ok: true, value: dms.hemi === 'S' || dms.hemi === 'W' ? -value : value };
}

// The other way, for filling the DMS fields from a saved spot. Seconds keep one
// decimal (about 3 m), and rounding that up to 60.0 carries into the minutes.
export function decimalToDms(value: number, axis: 'Latitude' | 'Longitude'): Dms {
	const hemi = axis === 'Latitude' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
	let tenths = Math.round(Math.abs(value) * 36000);
	const d = Math.floor(tenths / 36000);
	tenths -= d * 36000;
	const m = Math.floor(tenths / 600);
	const s = (tenths - m * 600) / 10;
	return { d: String(d), m: String(m), s: String(s), hemi };
}

// '42°26′20.4″N' -- for the admin table when it is showing DMS.
export function formatDms(value: number, axis: 'Latitude' | 'Longitude'): string {
	const { d, m, s, hemi } = decimalToDms(value, axis);
	return `${d}°${m}′${s}″${hemi}`;
}

export interface SwimSpot {
	id: number;
	name: string;
	lat: number;
	lon: number;
	swumOn: string | null; // 'YYYY-MM-DD', the most recent of `dates`
	// Every date it was swum, newest first. A regular swimming hole has many;
	// empty means swum, date forgotten (and always, on the anonymized map).
	dates: string[];
	waterType: string;
	country: string | null;
	region: string | null;
	note: string | null;
	// Who logged it and who else was there. Absent on the anonymized map,
	// which carries neither.
	owner?: string;
	tagged?: string[]; // accepted tags only
	// Every tag with where it stands. Only ever sent to the spot's owner.
	tags?: SpotTag[];
}

export type TagStatus = 'pending' | 'accepted' | 'declined';

export interface SpotTag {
	username: string;
	status: TagStatus;
}

// A tag waiting on the signed-in user, as the banner on /meSoup shows it.
// Someone whose swims you can see on /meSoup, and how much of them: their
// whole map (they shared it with you) or just the swims they tagged you in.
export interface Sharer {
	username: string;
	fullMap: boolean;
}

export interface PendingTag {
	spotId: number;
	name: string;
	owner: string;
	swumOn: string | null;
	waterLabel: string;
	country: string | null;
	region: string | null;
}

// Tags as they come off the admin form: usernames, trimmed, each once however
// it was capitalised. No cap on how many -- a swim with the whole club is a
// swim with the whole club.
export function normalizeTags(
	input: unknown
): { ok: true; tags: string[] } | { ok: false; error: string } {
	if (input === undefined || input === null) return { ok: true, tags: [] };
	if (!Array.isArray(input)) return { ok: false, error: 'Tags must be a list of usernames.' };
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const raw of input) {
		if (typeof raw !== 'string') return { ok: false, error: 'Tags must be usernames.' };
		const name = raw.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		tags.push(name);
	}
	return { ok: true, tags };
}

// A spot as the admin form holds it, before anything has been checked.
export type SwimSpotInput = Partial<Record<keyof SwimSpot, unknown>>;

export type Normalized = { ok: true; spot: Omit<SwimSpot, 'id'> } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string | null {
	const s = typeof value === 'string' ? value.trim() : '';
	return s === '' ? null : s;
}

// Accepts what a text input actually produces -- strings, blanks, the odd stray
// degree sign -- and either hands back a row ready for the database or says in
// one sentence what is wrong with it.
//
// `types` is the list the water type is checked against: the built-ins, or the
// built-ins plus the custom types when the caller has them.
export function normalizeSpot(
	input: SwimSpotInput,
	types: WaterTypeMeta[] = WATER_TYPES
): Normalized {
	const name = text(input.name);
	if (!name) return { ok: false, error: 'A spot needs a name.' };

	// A blank coordinate is missing, not zero -- Number('') is 0, which would
	// quietly drop the spot in the Gulf of Guinea.
	const coord = (v: unknown) => {
		const s = String(v ?? '').replace(/[^0-9.+-]/g, '');
		return s === '' ? NaN : Number(s);
	};
	const lat = coord(input.lat);
	const lon = coord(input.lon);
	if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
		return { ok: false, error: 'Latitude must be a number between -90 and 90.' };
	}
	if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
		return { ok: false, error: 'Longitude must be a number between -180 and 180.' };
	}

	// `dates` is the list; a lone `swumOn` is still accepted so a hand-made
	// request in the old shape keeps working.
	const rawDates = Array.isArray(input.dates) ? input.dates : [input.swumOn];
	const seen = new Set<string>();
	for (const raw of rawDates) {
		const d = text(raw);
		if (!d) continue;
		// A date input gives 'YYYY-MM-DD' or nothing, but the endpoint is also
		// reachable by hand, and a half-typed year should not reach the column.
		if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) {
			return { ok: false, error: `"${d}" is not a date in YYYY-MM-DD form.` };
		}
		seen.add(d);
	}
	// ISO dates sort as strings; newest first.
	const dates = [...seen].sort().reverse();
	const swumOn = dates[0] ?? null;

	const wt = text(input.waterType) ?? DEFAULT_WATER_TYPE;
	if (!types.some((t) => t.id === wt))
		return { ok: false, error: `"${wt}" is not one of the water types.` };

	return {
		ok: true,
		spot: {
			name,
			lat,
			lon,
			swumOn,
			dates,
			waterType: wt,
			country: text(input.country),
			region: text(input.region),
			note: text(input.note)
		}
	};
}

export interface SwimSummary {
	spots: number;
	// Visits, counting an undated spot as one: it was swum at least once.
	swims: number;
	countries: number;
	waterTypes: number;
	firstYear: number | null;
	latestYear: number | null;
}

// The figures above the map. Undated spots count towards the totals but not the
// years -- not knowing when I swam somewhere doesn't mean I didn't.
export function summarize(spots: SwimSpot[]): SwimSummary {
	const countries = new Set<string>();
	const types = new Set<string>();
	const years: number[] = [];
	let swims = 0;
	for (const s of spots) {
		if (s.country) countries.add(s.country.toLowerCase());
		types.add(s.waterType);
		const dates = s.dates ?? (s.swumOn ? [s.swumOn] : []);
		swims += Math.max(dates.length, 1);
		for (const d of dates) if (DATE_RE.test(d)) years.push(Number(d.slice(0, 4)));
	}
	return {
		spots: spots.length,
		swims,
		countries: countries.size,
		waterTypes: types.size,
		firstYear: years.length ? Math.min(...years) : null,
		latestYear: years.length ? Math.max(...years) : null
	};
}

// '41.4°N, 2.2°E' -- hemispheres rather than signs, because the list beside the
// map is read, not computed with.
export function formatCoords(lat: number, lon: number): string {
	const ns = lat >= 0 ? 'N' : 'S';
	const ew = lon >= 0 ? 'E' : 'W';
	return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function formatDate(swumOn: string | null): string {
	if (!swumOn || !DATE_RE.test(swumOn)) return 'date unknown';
	const [y, m, d] = swumOn.split('-').map(Number);
	// Built in UTC and read back in UTC: a local Date would shift an early-morning
	// date back a day west of Greenwich.
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

// 'Jul 4, 2025', or '12 swims · latest Jul 4, 2025' for a regular spot.
export function formatSwims(dates: string[] | undefined): string {
	if (!dates?.length) return 'date unknown';
	if (dates.length === 1) return formatDate(dates[0]);
	return `${dates.length} swims · latest ${formatDate(dates[0])}`;
}
