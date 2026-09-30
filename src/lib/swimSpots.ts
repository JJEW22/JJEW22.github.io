// src/lib/swimSpots.ts
// The swim-spot vocabulary and validation, in one client-safe place.
//
// Not under $lib/server, because all three consumers need it: the map at /meSoup
// colors its dots and builds its legend from WATER_TYPES, the admin form builds
// its dropdown from the same array, and the API validates writes with
// normalizeSpot() so the form and the endpoint can never disagree about what a
// valid spot is. The database deliberately holds no copy of this list.

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

const BY_ID = new Map(WATER_TYPES.map((t) => [t.id, t]));

// Always returns something. An unknown id can only come from a row written before
// a type was renamed, and a dot with no color is worse than a grey one.
export function waterType(id: string | null | undefined): WaterTypeMeta {
	return BY_ID.get(id ?? '') ?? BY_ID.get(DEFAULT_WATER_TYPE)!;
}

export interface SwimSpot {
	id: number;
	name: string;
	lat: number;
	lon: number;
	swumOn: string | null; // 'YYYY-MM-DD'
	waterType: string;
	country: string | null;
	region: string | null;
	note: string | null;
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
export function normalizeSpot(input: SwimSpotInput): Normalized {
	const name = text(input.name);
	if (!name) return { ok: false, error: 'A spot needs a name.' };

	const lat = Number(String(input.lat ?? '').replace(/[^0-9.+-]/g, ''));
	const lon = Number(String(input.lon ?? '').replace(/[^0-9.+-]/g, ''));
	if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
		return { ok: false, error: 'Latitude must be a number between -90 and 90.' };
	}
	if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
		return { ok: false, error: 'Longitude must be a number between -180 and 180.' };
	}

	const swumOn = text(input.swumOn);
	// A date input gives 'YYYY-MM-DD' or nothing, but the endpoint is also
	// reachable by hand, and a half-typed year should not reach the column.
	if (swumOn && (!DATE_RE.test(swumOn) || Number.isNaN(Date.parse(swumOn)))) {
		return { ok: false, error: `"${swumOn}" is not a date in YYYY-MM-DD form.` };
	}

	const wt = text(input.waterType) ?? DEFAULT_WATER_TYPE;
	if (!BY_ID.has(wt)) return { ok: false, error: `"${wt}" is not one of the water types.` };

	return {
		ok: true,
		spot: {
			name,
			lat,
			lon,
			swumOn,
			waterType: wt,
			country: text(input.country),
			region: text(input.region),
			note: text(input.note)
		}
	};
}

export interface SwimSummary {
	spots: number;
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
	for (const s of spots) {
		if (s.country) countries.add(s.country.toLowerCase());
		types.add(s.waterType);
		if (s.swumOn && DATE_RE.test(s.swumOn)) years.push(Number(s.swumOn.slice(0, 4)));
	}
	return {
		spots: spots.length,
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
