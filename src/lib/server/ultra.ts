// src/lib/server/ultra.ts
// Ultra tracking: store the points Overland posts, let an admin pick whose
// points are public and when, and serve that to the public page.
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import {
	METERS_PER_MILE,
	RACES,
	isRaceId,
	cleanTrack,
	isNullIsland,
	latestFix,
	pathLength,
	type AidStation,
	type RaceAbout,
	type RaceId,
	type RaceStatus
} from '$lib/ultra';

export class UltraError extends Error {}

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
	showBattery: boolean; // phone battery % on the public page
	// Which race the public page shows: the real one or the practice course.
	activeRace: RaceId;
	// The active race's clock, set on the admin page. Null start falls back to
	// its config's start; null end means start + its cutoffHours.
	raceStart: string | null;
	raceEnd: string | null;
}

// Each race's clock columns. The main race keeps the original ones.
const CLOCK_COLUMNS: Record<RaceId, { start: string; end: string }> = {
	main: { start: 'race_start', end: 'race_end' },
	test: { start: 'test_race_start', end: 'test_race_end' }
};

export async function getSettings(): Promise<UltraSettings> {
	const [row] = await sql<
		{
			mode: DisplayMode;
			live_since: Date | null;
			show_battery: boolean;
			active_race: string;
			race_start: Date | null;
			race_end: Date | null;
			test_race_start: Date | null;
			test_race_end: Date | null;
		}[]
	>`
		select mode, live_since, show_battery, active_race, race_start, race_end,
			test_race_start, test_race_end
		from ultra_settings where id = 1
	`;
	const activeRace: RaceId = isRaceId(row?.active_race) ? row.active_race : 'main';
	const test = activeRace === 'test';
	return {
		mode: row?.mode ?? 'race',
		liveSince: row?.live_since?.toISOString() ?? null,
		showBattery: row?.show_battery ?? true,
		activeRace,
		raceStart: (test ? row?.test_race_start : row?.race_start)?.toISOString() ?? null,
		raceEnd: (test ? row?.test_race_end : row?.race_end)?.toISOString() ?? null
	};
}

// Write the active race's clock. Only the fields passed are changed.
async function writeClock(
	race: RaceId,
	patch: { start?: Date | null; end?: Date | null },
	switchToRaceMode = false
): Promise<void> {
	const cols = CLOCK_COLUMNS[race];
	const set: Record<string, Date | null | string> = {};
	if (patch.start !== undefined) set[cols.start] = patch.start;
	if (patch.end !== undefined) set[cols.end] = patch.end;
	if (switchToRaceMode) set.mode = 'race';
	await sql`insert into ultra_settings (id) values (1) on conflict (id) do nothing`;
	await sql`update ultra_settings set ${sql(set)}, updated_at = now() where id = 1`;
}

// Switch the public page to another race. Each keeps its own clock, so
// trying out the test race leaves the real race's start alone.
export async function setActiveRace(race: RaceId): Promise<UltraSettings> {
	await sql`insert into ultra_settings (id) values (1) on conflict (id) do nothing`;
	await sql`update ultra_settings set active_race = ${race}, updated_at = now() where id = 1`;
	return getSettings();
}

// ---- the race clock ----

export interface RaceWindow {
	start: Date;
	end: Date;
	ended: boolean; // an end time was set (the race is over at `end`)
	source: 'admin' | 'config'; // where the start came from
}

// The active race's window: the admin's start (or its config's), to the
// admin's end (or start + cutoff).
export function raceWindowFrom(settings: UltraSettings): RaceWindow | null {
	const race = RACES[settings.activeRace];
	const startIso = settings.raceStart ?? race.start;
	if (!startIso) return null;
	const start = new Date(startIso);
	if (Number.isNaN(start.getTime())) return null;
	const end = settings.raceEnd
		? new Date(settings.raceEnd)
		: new Date(start.getTime() + race.cutoffHours * 3_600_000);
	return { start, end, ended: !!settings.raceEnd, source: settings.raceStart ? 'admin' : 'config' };
}

export function windowStatus(w: RaceWindow | null, now: Date): RaceStatus {
	if (!w) return 'unscheduled';
	if (now < w.start) return 'upcoming';
	if (now > w.end) return 'finished';
	return 'live';
}

const toDate = (v: unknown): Date | null => {
	if (v === null) return null;
	if (typeof v !== 'string') throw new UltraError('Expected an ISO time.');
	const d = new Date(v);
	if (Number.isNaN(d.getTime())) throw new UltraError("That isn't a valid time.");
	return d;
};

// "Start the race now", by the app's clock like the status checks: the active
// race's clock starts, any old end is cleared, and the public page switches
// to the race window so followers see it straight away.
export async function startRaceNow(): Promise<UltraSettings> {
	const { activeRace } = await getSettings();
	await writeClock(activeRace, { start: new Date(), end: null }, true);
	return getSettings();
}

export async function endRaceNow(): Promise<UltraSettings> {
	const s = await getSettings();
	const w = raceWindowFrom(s);
	if (!w) throw new UltraError('The race has no start time yet.');
	if (new Date() <= w.start) throw new UltraError("The race hasn't started yet.");
	// The app's clock, not the database's: the two can disagree by a few
	// seconds, and the race has to read as over the moment it's ended.
	await writeClock(s.activeRace, { end: new Date() });
	return getSettings();
}

// Set either end of the active race's clock to any time (null clears it).
// The end has to come after the start.
export async function setRaceTimes(patch: {
	raceStart?: unknown;
	raceEnd?: unknown;
}): Promise<UltraSettings> {
	const cur = await getSettings();
	const start =
		patch.raceStart !== undefined
			? toDate(patch.raceStart)
			: cur.raceStart
				? new Date(cur.raceStart)
				: null;
	const end =
		patch.raceEnd !== undefined
			? toDate(patch.raceEnd)
			: cur.raceEnd
				? new Date(cur.raceEnd)
				: null;
	const configStart = RACES[cur.activeRace].start;
	const effectiveStart = start ?? (configStart ? new Date(configStart) : null);
	if (end && !effectiveStart) throw new UltraError('Set a start time before an end time.');
	if (end && effectiveStart && end <= effectiveStart) {
		throw new UltraError('The end has to be after the start.');
	}
	await writeClock(cur.activeRace, { start, end });
	return getSettings();
}

export async function setShowBattery(show: boolean): Promise<UltraSettings> {
	await sql`
		insert into ultra_settings (id, show_battery, updated_at) values (1, ${show}, now())
		on conflict (id) do update set show_battery = excluded.show_battery, updated_at = now()
	`;
	return getSettings();
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
	pathTimes: number[]; // when each path point was recorded (ms), same order
	latest: { t: string; lat: number; lon: number; battery: number | null } | null;
	distanceMiles: number;
	elapsedMs: number | null;
	paceMsPerMile: number | null;
	// When this runner's clock started: the race start, when live was switched
	// on, or (in the preview) their first fix. The page measures course pace
	// from it.
	startedAt: string | null;
	// When the newest fix of each of the phone's last few uploads was taken (ms),
	// oldest first: the page carries the dot on between uploads at the average
	// speed across them.
	syncs: number[];
}

export interface TrackResponse {
	status: TrackStatus;
	mode: DisplayMode;
	liveSince: string | null;
	showBattery: boolean;
	race: {
		id: RaceId;
		test: boolean;
		name: string;
		start: string | null;
		end: string | null;
		distanceMiles: number | null;
		location: string;
		note: string;
		courseGpx: string | null;
		aidStations: AidStation[];
		googleMapsUrl: string | null;
		paceRangeMinPerMile: [number, number];
		latePaceMinPerMile: number;
		legPaceMinPerMile: Record<string, [number, number]>;
		about: RaceAbout | null;
	};
	runners: Runner[];
	serverTime: string;
}

// Enough to draw a smooth line; a 24-hour race at 1 fix per 10s is ~8,600.
const MAX_PATH_POINTS = 3000;
// The last 3 upload-to-upload stretches set the speed between uploads.
const SPEED_SYNCS = 4;

// The newest fix in each upload. One upload is one insert, so its points share
// a received_at exactly.
function syncTimes(rows: { t: Date; received_at: Date }[], count: number): number[] {
	const newest = new Map<number, number>();
	for (const r of rows) {
		const k = r.received_at.getTime();
		newest.set(k, Math.max(newest.get(k) ?? 0, r.t.getTime()));
	}
	return [...newest.values()].sort((a, b) => a - b).slice(-count);
}

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
	const w = raceWindowFrom(settings);
	const cfg = RACES[settings.activeRace];
	const race = {
		id: settings.activeRace,
		test: cfg.test,
		name: cfg.name,
		start: w?.start.toISOString() ?? null,
		end: w?.end.toISOString() ?? null,
		distanceMiles: cfg.distanceMiles,
		location: cfg.location,
		note: cfg.note,
		courseGpx: cfg.courseGpx,
		aidStations: cfg.aidStations,
		googleMapsUrl: cfg.googleMapsUrl,
		paceRangeMinPerMile: cfg.paceRangeMinPerMile,
		latePaceMinPerMile: cfg.latePaceMinPerMile,
		legPaceMinPerMile: cfg.legPaceMinPerMile ?? {},
		about: cfg.about
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
		status = windowStatus(w, now);
		if (w && (status === 'live' || status === 'finished')) {
			from = w.start;
			to = status === 'live' ? now : w.end;
		}
	}

	const response: TrackResponse = {
		status,
		mode: settings.mode,
		liveSince: settings.liveSince,
		showBattery: settings.showBattery,
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
			received_at: Date;
		}[]
	>`
		select device_id, recorded_at as t, lat, lon, accuracy, battery, received_at
		from ultra_points
		where recorded_at between ${from} and ${to}
			and device_id in ${sql(devices.map((d) => d.deviceId))}
		order by recorded_at
	`;

	// The clock for elapsed time: the race start, or when live was switched on.
	// The preview has no shared start, so each runner's runs from their first fix.
	const clockStart = preview ? null : from.getTime();

	for (const d of devices) {
		// The map line and the distance come from the cleaned points, so a bad fix
		// can't draw a spike or add miles. "Where are they now" is the newest
		// usable fix, which keeps updating while they stand still.
		const mine = rows.filter((r) => r.device_id === d.deviceId);
		const raw = mine.map((r) => ({
			t: r.t.toISOString(),
			lat: r.lat,
			lon: r.lon,
			accuracy: r.accuracy,
			battery: r.battery
		}));
		const clean = cleanTrack(raw);
		const runner: Runner = {
			id: d.deviceId,
			name: displayName({ device_id: d.deviceId, name: d.name }),
			color: d.color,
			path: [],
			pathTimes: [],
			latest: null,
			distanceMiles: 0,
			elapsedMs: status === 'live' && clockStart !== null ? now.getTime() - clockStart : null,
			startedAt: clockStart !== null ? new Date(clockStart).toISOString() : null,
			paceMsPerMile: null,
			syncs: syncTimes(mine, SPEED_SYNCS)
		};
		if (clean.length) {
			const last = latestFix(raw, clean) ?? clean[clean.length - 1];
			const startMs = clockStart ?? Date.parse(clean[0].t);
			// Elapsed runs to now while live. Once the race is ended by the admin,
			// it's the official time, end minus start; otherwise, the last fix.
			const endMs =
				status === 'live'
					? now.getTime()
					: status === 'finished' && w?.ended
						? w.end.getTime()
						: Date.parse(last.t);
			const miles = pathLength(clean) / METERS_PER_MILE;
			const step = Math.ceil(clean.length / MAX_PATH_POINTS);
			const add = (p: { lat: number; lon: number; t: string }) => {
				runner.path.push([p.lat, p.lon]);
				runner.pathTimes.push(Date.parse(p.t));
			};
			for (let i = 0; i < clean.length; i += step) add(clean[i]);
			const lastKept = clean[clean.length - 1];
			if ((clean.length - 1) % step !== 0) add(lastKept);
			// The line ends where the phone is now, so the marker sits on it.
			if (last !== lastKept) add(last);
			// The battery stays off the public payload when the admin has hidden
			// it -- not just off the page. The admin's own preview still sees it.
			const battery = settings.showBattery || preview ? (last.battery ?? null) : null;
			runner.latest = { t: last.t, lat: last.lat, lon: last.lon, battery };
			runner.startedAt = new Date(startMs).toISOString();
			runner.distanceMiles = miles;
			runner.elapsedMs = endMs - startMs;
			runner.paceMsPerMile = miles > 0.1 ? runner.elapsedMs / miles : null;
		}
		response.runners.push(runner);
	}
	return response;
}
