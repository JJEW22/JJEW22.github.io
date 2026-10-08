// src/lib/ultra.ts
// The ultra tracker's race details and track maths. Client-safe: the page and
// the API both import it.

export interface AidStation {
	name: string;
	mile: number; // race distance at the station
}

export interface RaceConfig {
	name: string;
	// ISO start time with its UTC offset, or null while the race isn't set.
	// No start = nothing is shown publicly.
	start: string | null;
	cutoffHours: number; // the window closes this long after the start
	distanceMiles: number | null;
	location: string;
	// A GPX of the course in static/, drawn under the live track. Optional.
	courseGpx: string | null;
	aidStations: AidStation[];
	// Free-text note shown under the title (race website, bib number, ...).
	note: string;
}

// Edit this for the race. Points the phone sends are only shown publicly
// between `start` and `start + cutoffHours`.
export const RACE: RaceConfig = {
	name: 'The entire Charles River',
	start: null, // set the start time to open the race window
	cutoffHours: 30,
	distanceMiles: 78.9,
	location: 'Hopkinton to Boston, MA',
	// Strava route "entire Charles river (kinda)": Echo Lake to the Charles
	// River Dam, 78.9 mi, ~880 m of climbing.
	courseGpx: '/ultra/charles-river.gpx',
	aidStations: [],
	note: ''
};

export const METERS_PER_MILE = 1609.344;

export type RaceStatus = 'unscheduled' | 'upcoming' | 'live' | 'finished';

export function raceWindow(race: RaceConfig = RACE): { start: Date; end: Date } | null {
	if (!race.start) return null;
	const start = new Date(race.start);
	if (Number.isNaN(start.getTime())) return null;
	return { start, end: new Date(start.getTime() + race.cutoffHours * 3_600_000) };
}

export function raceStatus(race: RaceConfig = RACE, now: Date = new Date()): RaceStatus {
	const w = raceWindow(race);
	if (!w) return 'unscheduled';
	if (now < w.start) return 'upcoming';
	if (now > w.end) return 'finished';
	return 'live';
}

// Great-circle distance in metres.
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6_371_000;
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

export interface TrackPoint {
	t: string; // ISO time of the fix
	lat: number;
	lon: number;
	accuracy: number | null;
	battery?: number | null;
}

// Fixes worse than this are skipped: a phone under tree cover can report a
// point 200m off, and every one of those would add a fake out-and-back.
export const MAX_ACCURACY_M = 50;
// A segment faster than this is a GPS jump, not running (it's ~11.2 mph).
export const MAX_SPEED_MPS = 5;
// Moves shorter than this are jitter while standing at an aid station. The
// real threshold is the larger of this and the fix's own reported accuracy:
// a fix good to 20m wobbles 5-15m between readings standing still.
export const MIN_STEP_M = 4;

// (0, 0) -- "Null Island", in the Atlantic -- is what a phone can report
// before it has a fix. Nobody is running there.
export function isNullIsland(lat: number, lon: number): boolean {
	return Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01;
}

// Could a runner get from a to b in the time between them?
function plausible(a: TrackPoint, b: TrackPoint): boolean {
	const d = haversine(a.lat, a.lon, b.lat, b.lon);
	const secs = (Date.parse(b.t) - Date.parse(a.t)) / 1000;
	return secs > 0 ? d / secs <= MAX_SPEED_MPS : d <= MAX_ACCURACY_M;
}

// The points worth drawing and measuring: no Null Island, no poor fixes, no
// jumps, no standing-still jitter.
//
// A jump is judged against the last kept point -- but that point can be the
// bad one (a first fix miles off, say), and then every real point after it
// would look like a jump. So a rejected point is held as a suspect: if the
// next point agrees with the suspect rather than with the kept point, the
// two of them outvote it and the kept point is dropped instead.
export function cleanTrack(points: TrackPoint[]): TrackPoint[] {
	const kept: TrackPoint[] = [];
	let suspect: TrackPoint | null = null;
	for (const p of points) {
		if (isNullIsland(p.lat, p.lon)) continue;
		if (p.accuracy !== null && p.accuracy > MAX_ACCURACY_M) continue;
		const prev = kept[kept.length - 1];
		if (!prev) {
			kept.push(p);
			continue;
		}
		if (!plausible(prev, p)) {
			if (suspect && plausible(suspect, p)) {
				kept.pop();
				kept.push(suspect, p);
				suspect = null;
			} else {
				suspect = p;
			}
			continue;
		}
		suspect = null;
		// Keep `prev` through jitter, so wobbles can't add up to distance. Slow
		// real movement isn't lost: `prev` holds until the move is big enough,
		// then the whole stretch counts.
		const step = Math.max(MIN_STEP_M, p.accuracy ?? 0);
		if (haversine(prev.lat, prev.lon, p.lat, p.lon) < step) continue;
		kept.push(p);
	}
	return kept;
}

// Metres along a cleaned track.
export function pathLength(points: TrackPoint[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		total += haversine(a.lat, a.lon, b.lat, b.lon);
	}
	return total;
}

// Distance along the track, ignoring poor fixes, jumps and jitter.
export function trackDistance(points: TrackPoint[]): number {
	return pathLength(cleanTrack(points));
}

// "1:05:09" from milliseconds.
export function formatDuration(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// "12:34 /mi" from milliseconds per mile.
export function formatPace(msPerMile: number | null): string {
	if (!msPerMile || !Number.isFinite(msPerMile)) return '—';
	const s = Math.round(msPerMile / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /mi`;
}
