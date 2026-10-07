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
	name: 'Ultra marathon',
	start: null,
	cutoffHours: 30,
	distanceMiles: null,
	location: '',
	courseGpx: null,
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
}

// Fixes worse than this are skipped: a phone under tree cover can report a
// point 200m off, and every one of those would add a fake out-and-back.
export const MAX_ACCURACY_M = 50;
// A segment faster than this is a GPS jump, not running (it's ~11.2 mph).
export const MAX_SPEED_MPS = 5;
// Moves shorter than this are jitter while standing at an aid station.
export const MIN_STEP_M = 4;

// Distance along the track, ignoring poor fixes, jumps and jitter.
export function trackDistance(points: TrackPoint[]): number {
	let total = 0;
	let prev: TrackPoint | null = null;
	for (const p of points) {
		if (p.accuracy !== null && p.accuracy > MAX_ACCURACY_M) continue;
		if (prev) {
			const d = haversine(prev.lat, prev.lon, p.lat, p.lon);
			const secs = (Date.parse(p.t) - Date.parse(prev.t)) / 1000;
			if (d < MIN_STEP_M) continue; // keep `prev` so jitter can't add up
			if (secs > 0 && d / secs > MAX_SPEED_MPS) continue;
			total += d;
		}
		prev = p;
	}
	return total;
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
