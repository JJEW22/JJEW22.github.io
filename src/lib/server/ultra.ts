// src/lib/server/ultra.ts
// Ultra tracking: store the points Overland posts, let an admin pick whose
// points are public and when, and serve that to the public page.
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import {
	METERS_PER_MILE,
	RACE,
	raceStatus,
	raceWindow,
	cleanTrack,
	isNullIsland,
	pathLength,
	type RaceStatus
} from '$lib/ultra';

export const ULTRA_ADMIN_ROLE = 'ultra:admin';

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
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || isNullIsland(lat, lon)) continue;
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
	// A phone the admin page hasn't seen before gets a row -- hidden.
	const devices = [...new Set(rows.map((r) => r.device_id))].map((device_id) => ({ device_id }));
	await sql`
		insert into ultra_devices ${sql(devices, 'device_id')}
		on conflict (device_id) do nothing
	`;
	const inserted = await sql`
		insert into ultra_points ${sql(rows, 'device_id', 'recorded_at', 'lat', 'lon', 'altitude', 'speed', 'accuracy', 'battery')}
		on conflict (device_id, recorded_at) do nothing
		returning id
	`;
	return inserted.length;
}

// ---- admin: settings and devices ----

export type DisplayMode = 'off' | 'race' | 'live';

export interface UltraSettings {
	mode: DisplayMode;
	liveSince: string | null;
}

export async function getSettings(): Promise<UltraSettings> {
	const [row] = await sql<{ mode: DisplayMode; live_since: Date | null }[]>`
		select mode, live_since from ultra_settings where id = 1
	`;
	return { mode: row?.mode ?? 'race', liveSince: row?.live_since?.toISOString() ?? null };
}

// Switching to live starts the clock: only points from now on are shown.
// Switching live -> live again (the "restart" button) moves the clock up.
export async function setMode(mode: DisplayMode): Promise<UltraSettings> {
	await sql`
		insert into ultra_settings (id, mode, live_since, updated_at)
		values (1, ${mode}, ${mode === 'live' ? new Date() : null}, now())
		on conflict (id) do update set
			mode = excluded.mode,
			live_since = case when excluded.mode = 'live' then excluded.live_since
				else ultra_settings.live_since end,
			updated_at = now()
	`;
	return getSettings();
}

// Map line colours for devices the admin hasn't picked one for. Chosen from
// the device id, so a device keeps its colour as the list reorders.
const PALETTE = ['#e4572e', '#2e86de', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#c0392b'];
function defaultColor(deviceId: string): string {
	let h = 0;
	for (const ch of deviceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return PALETTE[h % PALETTE.length];
}

export interface AdminDevice {
	deviceId: string;
	name: string | null;
	color: string;
	shown: boolean;
	points: number;
	firstAt: string | null;
	lastAt: string | null;
	battery: number | null;
}

// Every Device ID that has a settings row or has sent points. Points can
// arrive without a row (sent before the admin existed, or by an older deploy),
// and a phone with no row is simply hidden, so it's listed all the same.
export async function listDevices(): Promise<AdminDevice[]> {
	const rows = await sql<
		{
			device_id: string;
			name: string | null;
			color: string | null;
			shown: boolean;
			points: number;
			first_at: Date | null;
			last_at: Date | null;
			battery: number | null;
		}[]
	>`
		select ids.device_id, d.name, d.color, coalesce(d.shown, false) as shown,
			coalesce(s.points, 0) as points, s.first_at, s.last_at,
			(select battery from ultra_points p
				where p.device_id = ids.device_id and battery is not null
				order by recorded_at desc limit 1) as battery
		from (
			select device_id from ultra_devices
			union
			select distinct device_id from ultra_points
		) ids
		left join ultra_devices d on d.device_id = ids.device_id
		left join (
			select device_id, count(*)::int as points, min(recorded_at) as first_at,
				max(recorded_at) as last_at
			from ultra_points group by device_id
		) s on s.device_id = ids.device_id
		order by s.last_at desc nulls last, ids.device_id
	`;
	return rows.map((r) => ({
		deviceId: r.device_id,
		name: r.name,
		color: r.color ?? defaultColor(r.device_id),
		shown: r.shown,
		points: r.points,
		firstAt: r.first_at?.toISOString() ?? null,
		lastAt: r.last_at?.toISOString() ?? null,
		battery: r.battery
	}));
}

export class UltraError extends Error {}

export async function updateDevice(
	deviceId: string,
	patch: { name?: unknown; color?: unknown; shown?: unknown }
): Promise<void> {
	const [known] = await sql`
		select 1 from ultra_devices where device_id = ${deviceId}
		union all
		select 1 from ultra_points where device_id = ${deviceId}
		limit 1
	`;
	if (!known) throw new UltraError('No such device.');
	// A phone listed from its points alone gets its row on first edit.
	await sql`insert into ultra_devices (device_id) values (${deviceId}) on conflict do nothing`;
	if (patch.name !== undefined) {
		const name = typeof patch.name === 'string' ? patch.name.trim().slice(0, 40) : '';
		await sql`update ultra_devices set name = ${name || null} where device_id = ${deviceId}`;
	}
	if (patch.color !== undefined) {
		if (typeof patch.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(patch.color)) {
			throw new UltraError('Colour must look like #e4572e.');
		}
		await sql`update ultra_devices set color = ${patch.color} where device_id = ${deviceId}`;
	}
	if (patch.shown !== undefined) {
		await sql`update ultra_devices set shown = ${patch.shown === true} where device_id = ${deviceId}`;
	}
}

// ---- the public track ----

export type TrackStatus = RaceStatus | 'preview' | 'off';

export interface Runner {
	id: string;
	name: string;
	color: string;
	path: [number, number][]; // [lat, lon], thinned for drawing
	latest: { t: string; lat: number; lon: number; battery: number | null } | null;
	distanceMiles: number;
	elapsedMs: number | null;
	paceMsPerMile: number | null;
}

export interface TrackResponse {
	status: TrackStatus;
	mode: DisplayMode;
	liveSince: string | null;
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
	runners: Runner[];
	serverTime: string;
}

// Enough to draw a smooth line; a 24-hour race at 1 fix per 10s is ~8,600.
const MAX_PATH_POINTS = 3000;

function displayName(d: { device_id: string; name: string | null }): string {
	return d.name || d.device_id || 'Unnamed phone';
}

// What the public page shows: the devices switched on in the admin, inside
// the window the display mode allows.
//
// `preview` (admins only, checked by the caller) shows the last 24 hours
// whatever the mode, so a phone can be checked before anything is public --
// for the shown devices, or every device if none are shown yet.
export async function loadTrack(preview = false): Promise<TrackResponse> {
	const now = new Date();
	const settings = await getSettings();
	const w = raceWindow();
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

	let status: TrackStatus;
	let from: Date | null = null;
	let to: Date = now;
	if (preview) {
		status = 'preview';
		from = new Date(now.getTime() - 24 * 3_600_000);
	} else if (settings.mode === 'off') {
		status = 'off';
	} else if (settings.mode === 'live') {
		status = 'live';
		from = settings.liveSince ? new Date(settings.liveSince) : now;
	} else {
		status = raceStatus(RACE, now);
		if (w && (status === 'live' || status === 'finished')) {
			from = w.start;
			to = status === 'live' ? now : w.end;
		}
	}

	const response: TrackResponse = {
		status,
		mode: settings.mode,
		liveSince: settings.liveSince,
		race,
		runners: [],
		serverTime: now.toISOString()
	};
	if (!from) return response; // nothing is public right now

	const all = await listDevices();
	let devices = all.filter((d) => d.shown);
	if (preview && !devices.length) devices = all;
	if (!devices.length) return response;

	const rows = await sql<
		{
			device_id: string;
			t: Date;
			lat: number;
			lon: number;
			accuracy: number | null;
			battery: number | null;
		}[]
	>`
		select device_id, recorded_at as t, lat, lon, accuracy, battery from ultra_points
		where recorded_at between ${from} and ${to}
			and device_id in ${sql(devices.map((d) => d.deviceId))}
		order by recorded_at
	`;

	// The clock for elapsed time: the race start, or when live was switched on.
	// The preview has no shared start, so each runner's runs from their first fix.
	const clockStart = preview ? null : from.getTime();

	for (const d of devices) {
		// The map line, the distance and "where are they" all come from the same
		// cleaned points, so a bad fix can't draw a spike or add miles.
		const clean = cleanTrack(
			rows
				.filter((r) => r.device_id === d.deviceId)
				.map((r) => ({
					t: r.t.toISOString(),
					lat: r.lat,
					lon: r.lon,
					accuracy: r.accuracy,
					battery: r.battery
				}))
		);
		const runner: Runner = {
			id: d.deviceId,
			name: displayName({ device_id: d.deviceId, name: d.name }),
			color: d.color,
			path: [],
			latest: null,
			distanceMiles: 0,
			elapsedMs: status === 'live' && clockStart !== null ? now.getTime() - clockStart : null,
			paceMsPerMile: null
		};
		if (clean.length) {
			const last = clean[clean.length - 1];
			const startMs = clockStart ?? Date.parse(clean[0].t);
			// Elapsed runs to now while live; otherwise to the last fix.
			const endMs = status === 'live' ? now.getTime() : Date.parse(last.t);
			const miles = pathLength(clean) / METERS_PER_MILE;
			const step = Math.ceil(clean.length / MAX_PATH_POINTS);
			for (let i = 0; i < clean.length; i += step) runner.path.push([clean[i].lat, clean[i].lon]);
			if ((clean.length - 1) % step !== 0) runner.path.push([last.lat, last.lon]);
			runner.latest = { t: last.t, lat: last.lat, lon: last.lon, battery: last.battery ?? null };
			runner.distanceMiles = miles;
			runner.elapsedMs = endMs - startMs;
			runner.paceMsPerMile = miles > 0.1 ? runner.elapsedMs / miles : null;
		}
		response.runners.push(runner);
	}
	return response;
}
