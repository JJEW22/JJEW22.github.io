// src/lib/ultra.ts
// The ultra tracker's race details and track maths. Client-safe: the page and
// the API both import it.

export interface AidStation {
	name: string;
	mile: number; // race distance at the station
	// Exact spot, if you have it. Without one, the station is placed on the
	// course GPX at `mile`.
	lat?: number;
	lon?: number;
}

export interface RaceAbout {
	hook: string; // the opening line
	intro: string;
	route: string; // "start → finish", for the facts strip
	help: {
		icon: string;
		title: string;
		text: string;
		// List the stops still "looking for volunteer" under this item.
		openVolunteerStops?: boolean;
	}[]; // empty: no "How you can help" section
	contact: string; // empty: no closing line
}

export interface RaceConfig {
	name: string;
	// What the admin page's race switch calls it.
	label: string;
	// A practice race: the public page says so, loudly.
	test: boolean;
	// ISO start time with its UTC offset, or null while the race isn't set.
	// No start = nothing is shown publicly.
	start: string | null;
	cutoffHours: number; // the window closes this long after the start
	distanceMiles: number | null;
	location: string;
	// A GPX of the course in static/, drawn under the live track. Optional.
	courseGpx: string | null;
	aidStations: AidStation[];
	// A shared Google My Maps link of the course (import the GPX at
	// mymaps.google.com, share "anyone with the link"). Shows an "Open in
	// Google Maps" button; null hides it.
	googleMapsUrl: string | null;
	// The arrival windows in the stops table, in minutes per mile: each stop's
	// window is the previous stop's late time plus the leg at the fast pace
	// (early end) and at the slow pace (late end, which the next stop builds on).
	paceRangeMinPerMile: [number, number];
	// A different pace range for the leg into a particular stop, keyed by the
	// stop's name -- a leg ridden on a train, say.
	legPaceMinPerMile?: Record<string, [number, number]>;
	// The race summary at the top of the page (moves under the stops table
	// once the race is live). The start time and the open volunteer stops are
	// filled in by the page from the race clock and the stop names.
	about: RaceAbout | null;
	// Free-text note shown under the title (race website, bib number, ...).
	note: string;
}

// The races the tracker knows. The admin page switches the public page
// between them; each keeps its own race clock. Points the phones send are only
// shown publicly between a race's start and `start + cutoffHours`.
export type RaceId = 'main' | 'test';
export const RACE_IDS: RaceId[] = ['main', 'test'];

export function isRaceId(v: unknown): v is RaceId {
	return typeof v === 'string' && (RACE_IDS as string[]).includes(v);
}

// The real race.
export const RACE: RaceConfig = {
	name: 'The entire Charles River',
	label: 'The entire Charles River',
	test: false,
	start: null, // set the start time to open the race window
	cutoffHours: 30,
	distanceMiles: 78.2,
	location: 'Hopkinton to Boston, MA',
	// Strava route "entire Charles river (kinda)", shortened past Volunteer
	// stop #1: Echo Lake to Night Shift Brewing, 78.2 mi. Its 15 waypoints
	// (start, 13 stops, finish) are the aid stations; the page measures their
	// miles from the track itself.
	courseGpx: '/ultra/charles-river.gpx',
	aidStations: [],
	// The course on Google My Maps (view-only link; editing stays with the owner).
	googleMapsUrl: 'https://www.google.com/maps/d/viewer?mid=1M0ZxjYQmL5LDcqTH9S_LRSnjzh-PznU',
	paceRangeMinPerMile: [9, 12],
	about: {
		hook: 'Have you ever wanted to cosplay as a leaf going downstream?',
		intro:
			'Well, we did too! So we are running the inaugural Run the Entire Charles River (kinda), and this page is your way to track us as we do!',
		route: 'Echo Lake, Hopkinton → Night Shift Brewing, Boston',
		help: [
			{
				icon: '🥤',
				title: 'Staff an aid station',
				text: 'Bring water, snacks and supplies to us at a set spot on the course.',
				openVolunteerStops: true
			},
			{
				icon: '🚴',
				title: 'Run or bike with us',
				text: "Can't do an aid station? It's never too late to jump in anywhere along the course and run or bike a stretch with us."
			},
			{
				icon: '🍝',
				title: 'Make us food',
				text: "We'll need a lot of fuel and don't want just GUs, so anyone is welcome to make something for us. Think carbs, electrolytes and the like."
			}
		],
		contact: 'Want to help? Reach out to Arianna or Jack <3'
	},
	note: ''
};

// A short practice course for trying the tracker end to end before race day:
// walk from 7 Bynner St to Jackson Square, the Orange Line to Back Bay, then
// walk via Copley Square to the Tracksmith Trackhouse on Newbury St. Walking
// legs from OpenStreetMap's router; the train is drawn station to station.
export const TEST_RACE: RaceConfig = {
	name: 'Test race: Bynner St to Tracksmith',
	label: 'Test: Bynner St → Tracksmith (Orange Line)',
	test: true,
	start: null,
	cutoffHours: 3,
	distanceMiles: 3.4,
	location: 'Jamaica Plain to Back Bay, Boston',
	courseGpx: '/ultra/test-bynner-tracksmith.gpx',
	aidStations: [],
	googleMapsUrl: null,
	paceRangeMinPerMile: [9, 12],
	// The Orange Line, Jackson Square to Back Bay: ~2.1 mi in ~8-10 minutes,
	// plus some waiting on the platform.
	legPaceMinPerMile: { 'Back Bay T (off the Orange Line)': [3, 6] },
	about: {
		hook: 'This is a test run of the tracker.',
		intro:
			'A short practice trip from 7 Bynner St to the Tracksmith Trackhouse, walking to Jackson Square, riding the Orange Line to Back Bay and walking via Copley Square, to check everything works before race day. The real race is the entire Charles River.',
		route: '7 Bynner St → Orange Line → Tracksmith Trackhouse',
		help: [],
		contact: ''
	},
	note: ''
};

export const RACES: Record<RaceId, RaceConfig> = { main: RACE, test: TEST_RACE };

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

// Where the phone is now, and when it last reported: the newest fix that's
// usable (not Null Island, decent accuracy) and plausible from the last kept
// point. Standing still, the cleaned track stops growing -- wobble isn't
// distance -- but the phone is still reporting, and followers should see that
// rather than "no update for an hour". Falls back to the last kept point.
export function latestFix(points: TrackPoint[], clean: TrackPoint[]): TrackPoint | null {
	const anchor = clean[clean.length - 1];
	if (!anchor) return null;
	const since = Date.parse(anchor.t);
	for (let i = points.length - 1; i >= 0; i--) {
		const p = points[i];
		if (Date.parse(p.t) <= since) break;
		if (isNullIsland(p.lat, p.lon)) continue;
		if (p.accuracy !== null && p.accuracy > MAX_ACCURACY_M) continue;
		if (plausible(anchor, p)) return p;
	}
	return anchor;
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

// ---- the course ----

export interface CourseWaypoint {
	name: string;
	lat: number;
	lon: number;
}

// The track (trkpt / rtept, in order) and any named waypoints (wpt) in a GPX.
export function parseGpx(text: string): { track: [number, number][]; waypoints: CourseWaypoint[] } {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	const pt = (el: Element): [number, number] => [
		Number(el.getAttribute('lat')),
		Number(el.getAttribute('lon'))
	];
	const ok = ([a, b]: [number, number]) => Number.isFinite(a) && Number.isFinite(b);
	const track = [...doc.querySelectorAll('trkpt, rtept')].map(pt).filter(ok);
	const waypoints = [...doc.querySelectorAll('wpt')]
		.map((el) => {
			const [lat, lon] = pt(el);
			return { name: el.querySelector('name')?.textContent?.trim() || 'Waypoint', lat, lon };
		})
		.filter((w) => ok([w.lat, w.lon]));
	return { track, waypoints };
}

// Cumulative miles at each track point.
export function courseMiles(track: [number, number][]): number[] {
	const out = [0];
	for (let i = 1; i < track.length; i++) {
		const [a, b] = [track[i - 1], track[i]];
		out.push(out[i - 1] + haversine(a[0], a[1], b[0], b[1]) / METERS_PER_MILE);
	}
	return out;
}

// The point `mile` miles along the course, interpolated between track points.
// Clamped to the start and finish.
export function pointAtMile(
	track: [number, number][],
	miles: number[],
	mile: number
): [number, number] | null {
	if (!track.length) return null;
	if (mile <= 0) return track[0];
	const total = miles[miles.length - 1];
	if (mile >= total) return track[track.length - 1];
	let i = 1;
	while (miles[i] < mile) i++;
	const f = (mile - miles[i - 1]) / (miles[i] - miles[i - 1] || 1);
	const [a, b] = [track[i - 1], track[i]];
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export interface PlacedStation extends AidStation {
	lat: number;
	lon: number;
}

// Every aid station with a position: its own lat/lon, or its mile on the course.
export function placeStations(stations: AidStation[], track: [number, number][]): PlacedStation[] {
	const miles = courseMiles(track);
	const out: PlacedStation[] = [];
	for (const s of stations) {
		if (s.lat !== undefined && s.lon !== undefined) {
			out.push({ ...s, lat: s.lat, lon: s.lon });
			continue;
		}
		const at = pointAtMile(track, miles, s.mile);
		if (at) out.push({ ...s, lat: at[0], lon: at[1] });
	}
	return out;
}

const xmlEscape = (t: string) =>
	t.replace(
		/[<>&'"]/g,
		(c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`
	);

// A GPX of the course with the aid stations as waypoints -- what Google My
// Maps, Gaia, Strava and the rest import.
export function buildGpx(
	name: string,
	track: [number, number][],
	stations: { name: string; lat: number; lon: number; mile?: number }[]
): string {
	const wpts = stations
		.map(
			(s) =>
				`  <wpt lat="${s.lat.toFixed(6)}" lon="${s.lon.toFixed(6)}"><name>${xmlEscape(s.name)}</name>` +
				(s.mile !== undefined ? `<desc>Mile ${s.mile}</desc>` : '') +
				'</wpt>'
		)
		.join('\n');
	const pts = track
		.map(([lat, lon]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="johnjackwilkins.com/ultra" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xmlEscape(name)}</name></metadata>
${wpts}
  <trk>
    <name>${xmlEscape(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

// ---- progress along the course ----

// Further than this from the route and a fix doesn't count as on the course
// (a detour, a car to the start, testing at home).
export const ON_COURSE_M = 250;

export interface CourseIndex {
	track: [number, number][];
	miles: number[]; // cumulative, per track point
	total: number;
}

export function indexCourse(track: [number, number][]): CourseIndex {
	const miles = courseMiles(track);
	return { track, miles, total: miles[miles.length - 1] ?? 0 };
}

// The nearest point on the course to (lat, lon), searching only the segments
// that start between `fromMile` and `toMile`. Returns its course mile and how
// far off the route the point is. Flat-earth maths per segment: exact enough
// over the few hundred metres that matter.
export function projectOnCourse(
	ci: CourseIndex,
	lat: number,
	lon: number,
	fromMile = 0,
	toMile = Infinity
): { mile: number; offMeters: number } {
	const R = 6_371_000;
	const rad = Math.PI / 180;
	const kx = Math.cos(lat * rad) * R * rad; // metres per degree of longitude here
	const ky = R * rad;
	let best = { mile: 0, offMeters: Infinity };
	const { track, miles } = ci;
	for (let i = 1; i < track.length; i++) {
		if (miles[i] < fromMile) continue;
		if (miles[i - 1] > toMile) break;
		const [a, b] = [track[i - 1], track[i]];
		const ax = (a[1] - lon) * kx;
		const ay = (a[0] - lat) * ky;
		const bx = (b[1] - lon) * kx;
		const by = (b[0] - lat) * ky;
		const dx = bx - ax;
		const dy = by - ay;
		const len2 = dx * dx + dy * dy;
		const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
		const off = Math.hypot(ax + t * dx, ay + t * dy);
		if (off < best.offMeters) {
			best = { mile: miles[i - 1] + t * (miles[i] - miles[i - 1]), offMeters: off };
		}
	}
	return best;
}

// How far along the course a runner has got, from their track in order.
//
// Progress only moves forward and only looks a little ahead of where it was,
// so a route that passes near itself (or a GPS wobble) can't jump them miles
// on. A fix off the route keeps the last on-course mile; if the narrow look
// ahead finds nothing (a signal gap), the rest of the course is searched.
export function courseProgress(
	ci: CourseIndex,
	path: [number, number][]
): { mile: number; offMeters: number; onCourse: boolean; pointMiles: number[] } {
	let mile = 0;
	let found = false;
	let lastOff = Infinity;
	// The course mile reached by each point (-1 until the runner is on course),
	// for reading off when they passed a given mile.
	const pointMiles: number[] = [];
	for (const [lat, lon] of path) {
		let r = projectOnCourse(ci, lat, lon, found ? mile - 0.25 : 0, found ? mile + 2 : Infinity);
		if (r.offMeters > ON_COURSE_M && found) {
			const wide = projectOnCourse(ci, lat, lon, mile - 0.25, Infinity);
			if (wide.offMeters <= ON_COURSE_M) r = wide;
		}
		if (r.offMeters <= ON_COURSE_M) {
			mile = found ? Math.max(mile, r.mile) : r.mile;
			found = true;
		}
		lastOff = r.offMeters;
		pointMiles.push(found ? mile : -1);
	}
	return { mile, offMeters: lastOff, onCourse: found, pointMiles };
}

// When a runner reached course mile `mile`: interpolated between the two
// points either side of it. Null if they haven't got there.
export function timeAtMile(pointMiles: number[], times: number[], mile: number): number | null {
	for (let k = 0; k < pointMiles.length; k++) {
		if (pointMiles[k] < mile) continue;
		const j = k - 1;
		if (j < 0 || pointMiles[j] < 0 || pointMiles[k] === pointMiles[j]) return times[k] ?? null;
		const f = (mile - pointMiles[j]) / (pointMiles[k] - pointMiles[j]);
		return times[j] + f * (times[k] - times[j]);
	}
	return null;
}

// The course mile a runner had reached at time `t`, read off their track.
// Null before they were on the course.
export function mileAtTime(pointMiles: number[], times: number[], t: number): number | null {
	let k = -1;
	while (k + 1 < times.length && times[k + 1] <= t) k++;
	if (k < 0 || pointMiles[k] < 0) return null;
	const n = k + 1;
	if (n >= times.length || times[n] === times[k]) return pointMiles[k];
	return pointMiles[k] + ((t - times[k]) / (times[n] - times[k])) * (pointMiles[n] - pointMiles[k]);
}

// Faster than this between uploads is a bad estimate, not a runner (even on
// a train): 60 mph, in miles per ms.
const MAX_ESTIMATE_MI_PER_MS = 1 / 60_000;

// Where a runner probably is at `at`, between the phone's uploads (every
// couple of minutes): their course mile at the last fix, carried on at their
// average speed from the oldest of `syncs` to that fix. Standing still, it
// stays put. It stops guessing a while after the next upload was due, so a
// phone that's lost signal doesn't run its dot off down the course.
export function estimateMile(
	pointMiles: number[],
	times: number[],
	syncs: number[], // the newest fix of each recent upload (ms), oldest first
	at: number,
	total: number
): { mile: number; at: number } | null {
	const lastT = times[times.length - 1];
	const lastMile = pointMiles[pointMiles.length - 1];
	if (syncs.length < 2 || lastT === undefined || lastMile < 0) return null;
	const fromMile = mileAtTime(pointMiles, times, syncs[0]);
	if (fromMile === null || lastT - syncs[0] < 30_000) return null;
	const speed = Math.min(
		MAX_ESTIMATE_MI_PER_MS,
		Math.max(0, (lastMile - fromMile) / (lastT - syncs[0]))
	);
	const interval = (syncs[syncs.length - 1] - syncs[0]) / (syncs.length - 1);
	const ahead = Math.min(10 * 60_000, Math.max(2 * 60_000, 2 * interval));
	const t = Math.min(at, lastT + ahead);
	if (t <= lastT) return { mile: lastMile, at: lastT };
	return { mile: Math.min(total, lastMile + speed * (t - lastT)), at: t };
}

// ---- arrival windows ----

export interface ScheduleRow {
	kind: 'start' | 'arrived' | 'estimate';
	at?: number; // 'start' / 'arrived': when (ms, or ms after the start if relative)
	low?: number; // 'estimate': the early end of the window
	high?: number; // 'estimate': the late end
	late?: boolean; // the late end has passed and they haven't arrived
}

// The arrival window at every stop.
//
// Each stop's window is built on the previous stop's late time: early = that
// + leg miles × the fast pace, late = that + leg miles × the slow pace, and
// the late time carries on to the next stop. With a runner on course, a stop
// they've reached shows when they actually got there (and the chain restarts
// from it), and the next stop is measured from where they are now.
//
// `start` null means no start time yet: times come back as ms after the start.
export function stopSchedule(
	stops: { mile: number }[],
	start: number | null,
	// One range for every leg, or one per stop (the leg ending at that stop).
	paceMinPerMile: [number, number] | [number, number][],
	runner: {
		arrivals: (number | null)[]; // per stop
		progressMile: number | null; // where they are on the course
		fixMs: number | null; // when that was
	} | null = null,
	now: number = Date.now()
): ScheduleRow[] {
	const perStop = Array.isArray(paceMinPerMile[0]);
	const paceAt = (i: number): [number, number] =>
		perStop ? (paceMinPerMile as [number, number][])[i] : (paceMinPerMile as [number, number]);
	let base = { mile: 0, t: start ?? 0 };
	let measuredFromRunner = false;
	return stops.map((st, i) => {
		if (st.mile < 0.1) {
			return { kind: 'start', at: runner?.arrivals[i] ?? start ?? 0 };
		}
		const arrived = runner?.arrivals[i] ?? null;
		if (arrived !== null) {
			base = { mile: st.mile, t: arrived };
			return { kind: 'arrived', at: arrived };
		}
		// The first stop they haven't reached: measure from where they are.
		if (
			!measuredFromRunner &&
			runner?.progressMile != null &&
			runner.fixMs != null &&
			start !== null &&
			runner.progressMile > base.mile
		) {
			base = { mile: runner.progressMile, t: runner.fixMs };
		}
		measuredFromRunner = true;
		const leg = Math.max(0, st.mile - base.mile);
		const [fast, slow] = paceAt(i).map((m) => m * 60_000);
		const low = base.t + leg * fast;
		const high = base.t + leg * slow;
		base = { mile: st.mile, t: high };
		return { kind: 'estimate', low, high, late: start !== null && high < now };
	});
}

// A point opened in Google Maps as a pin. Directions are one tap away in the
// Maps UI, and people can pick how they're getting there (car, bike, foot).
export function placeUrl(lat: number, lon: number): string {
	return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}
