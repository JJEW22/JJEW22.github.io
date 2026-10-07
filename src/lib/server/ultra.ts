// src/lib/server/ultra.ts
// Ultra tracking: store the points Overland posts, and serve the race window.
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import {
	METERS_PER_MILE,
	RACE,
	raceStatus,
	raceWindow,
	trackDistance,
	type RaceStatus,
	type TrackPoint
} from '$lib/ultra';

// ---- ingest ----

// The phone's secret, from ULTRA_INGEST_TOKEN. Overland sends it as
// "Authorization: Bearer <token>" (its Access Token setting); `?token=` works
// too for an endpoint URL with the token baked in.
export function ingestAuthorized(request: Request, url: URL): boolean {
	const secret = env.ULTRA_INGEST_TOKEN?.trim();
	if (!secret) return false;
	const auth = request.headers.get('authorization') ?? '';
	const given = (auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? url.searchParams.get('token') ?? '').trim();
	if (!given) return false;
	// Hash both so the comparison is constant-time whatever the lengths.
	const h = (s: string) => crypto.createHash('sha256').update(s).digest();
	return crypto.timingSafeEqual(h(given), h(secret));
}

// One Overland location: a GeoJSON Point feature.
interface OverlandFeature {
	type?: string;
	geometry?: { type?: string; coordinates?: unknown };
	properties?: {
		timestamp?: string;
		altitude?: number;
		speed?: number;
		horizontal_accuracy?: number;
		battery_level?: number;
		device_id?: string;
	};
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Store a batch. Returns how many points were new (resent ones are skipped).
export async function ingestLocations(locations: unknown): Promise<number> {
	if (!Array.isArray(locations)) return 0;
	const rows = [];
	for (const f of locations as OverlandFeature[]) {
		const c = f?.geometry?.type === 'Point' ? f.geometry.coordinates : null;
		if (!Array.isArray(c)) continue;
		const lon = num(c[0]);
		const lat = num(c[1]);
		const t = f.properties?.timestamp ? new Date(f.properties.timestamp) : null;
		if (lat === null || lon === null || !t || Number.isNaN(t.getTime())) continue;
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
		const p = f.properties ?? {};
		// iOS reports -1 for "unknown" speed and battery.
		const speed = num(p.speed);
		const battery = num(p.battery_level);
		rows.push({
			device_id: String(p.device_id ?? '').slice(0, 100),
			recorded_at: t,
			lat,
			lon,
			altitude: num(p.altitude),
			speed: speed !== null && speed >= 0 ? speed : null,
			accuracy: num(p.horizontal_accuracy),
			battery: battery !== null && battery >= 0 ? battery : null
		});
	}
	if (!rows.length) return 0;
	const inserted = await sql`
		insert into ultra_points ${sql(rows, 'device_id', 'recorded_at', 'lat', 'lon', 'altitude', 'speed', 'accuracy', 'battery')}
		on conflict (device_id, recorded_at) do nothing
		returning id
	`;
	return inserted.length;
}

// ---- the public track ----

export interface TrackResponse {
	status: RaceStatus | 'preview';
	race: {
		name: string;
		start: string | null;
		end: string | null;
		distanceMiles: number | null;
		location: string;
		note: string;
		courseGpx: string | null;
		aidStations: { name: string; mile: number }[];
	};
	path: [number, number][]; // [lat, lon], thinned for drawing
	latest: { t: string; lat: number; lon: number; battery: number | null } | null;
	distanceMiles: number;
	elapsedMs: number | null;
	paceMsPerMile: number | null;
	serverTime: string;
}

// Enough to draw a smooth line; a 24-hour race at 1 fix per 10s is ~8,600.
const MAX_PATH_POINTS = 3000;

// `preview` (admins only, checked by the caller) shows the last 24 hours
// whatever the race window, so the phone setup can be tested before race day.
export async function loadTrack(preview = false): Promise<TrackResponse> {
	const now = new Date();
	const w = raceWindow();
	const status = preview ? 'preview' : raceStatus(RACE, now);
	const race = {
		name: RACE.name,
		start: w?.start.toISOString() ?? null,
		end: w?.end.toISOString() ?? null,
		distanceMiles: RACE.distanceMiles,
		location: RACE.location,
		note: RACE.note,
		courseGpx: RACE.courseGpx,
		aidStations: RACE.aidStations
	};
	const empty: TrackResponse = {
		status,
		race,
		path: [],
		latest: null,
		distanceMiles: 0,
		elapsedMs: status === 'live' && w ? now.getTime() - w.start.getTime() : null,
		paceMsPerMile: null,
		serverTime: now.toISOString()
	};

	let from: Date;
	let to: Date;
	if (preview) {
		from = new Date(now.getTime() - 24 * 3_600_000);
		to = now;
	} else if (w && (status === 'live' || status === 'finished')) {
		from = w.start;
		to = status === 'live' ? now : w.end;
	} else {
		return empty; // not started (or not scheduled): nothing is public
	}

	const rows = await sql<
		{ t: Date; lat: number; lon: number; accuracy: number | null; battery: number | null }[]
	>`
		select recorded_at as t, lat, lon, accuracy, battery from ultra_points
		where recorded_at between ${from} and ${to}
		order by recorded_at
	`;
	if (!rows.length) return empty;

	const points: TrackPoint[] = rows.map((r) => ({
		t: r.t.toISOString(),
		lat: r.lat,
		lon: r.lon,
		accuracy: r.accuracy
	}));
	const meters = trackDistance(points);
	const last = rows[rows.length - 1];
	const startMs = preview ? rows[0].t.getTime() : from.getTime();
	// Elapsed runs to now while live; once finished, to the last fix.
	const endMs = status === 'live' ? now.getTime() : last.t.getTime();
	const elapsedMs = endMs - startMs;
	const miles = meters / METERS_PER_MILE;

	const step = Math.ceil(rows.length / MAX_PATH_POINTS);
	const path: [number, number][] = [];
	for (let i = 0; i < rows.length; i += step) path.push([rows[i].lat, rows[i].lon]);
	if ((rows.length - 1) % step !== 0) path.push([last.lat, last.lon]);

	return {
		...empty,
		path,
		latest: { t: last.t.toISOString(), lat: last.lat, lon: last.lon, battery: last.battery },
		distanceMiles: miles,
		elapsedMs,
		paceMsPerMile: miles > 0.1 ? elapsedMs / miles : null
	};
}
