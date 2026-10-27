// src/lib/server/housing.ts
// Pulling the housing data from FRED and Zillow Research into the database, and
// reading it back out for /housing.
//
// Nothing is fetched on a page load. A refresh downloads ~6MB of Zillow CSVs
// and a handful of FRED series, which is too slow to sit in front of a request,
// so it only runs when an admin asks for one or the weekly workflow does.

import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import {
	DEFAULT_ASSUMPTIONS,
	FRED_SERIES,
	HISTORY_START,
	US_REGION_ID,
	ZILLOW_DATASETS,
	parseZillowUrl,
	type Assumptions,
	type House,
	type Point
} from '$lib/housing';

// site:admin implies this one, via hasRole().
export const HOUSING_ADMIN_ROLE = 'housing:admin';

export type Source = 'fred' | 'zillow';
export const SOURCES: Source[] = ['fred', 'zillow'];

interface SeriesRow {
	source: Source;
	key: string;
	region_id: string;
	region_name: string | null;
	region_type: string | null;
	state_name: string | null;
	size_rank: number | null;
	points: Point[];
}

// --- FRED ---

interface FredObservation {
	date: string;
	value: string; // '.' for a missing observation
}

async function fetchFredSeries(id: string): Promise<Point[]> {
	const params = new URLSearchParams({
		series_id: id,
		api_key: env.FRED_API_KEY ?? '',
		file_type: 'json',
		observation_start: HISTORY_START
	});
	const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`);
	if (!res.ok) {
		// FRED explains itself in error_message. The URL carries the key, so it
		// is never part of the error.
		const body = await res.json().catch(() => null);
		throw new Error(`FRED ${id}: ${res.status} ${body?.error_message ?? res.statusText}`);
	}
	const data: { observations?: FredObservation[] } = await res.json();
	return (data.observations ?? [])
		.filter((o) => o.value !== '.')
		.map((o): Point => [o.date, Number(o.value)])
		.filter(([, v]) => Number.isFinite(v));
}

async function syncFred(): Promise<string> {
	if (!env.FRED_API_KEY) throw new Error('FRED_API_KEY is not set');
	const rows: SeriesRow[] = [];
	for (const s of FRED_SERIES) {
		rows.push({
			source: 'fred',
			key: s.id,
			region_id: '',
			region_name: 'United States',
			region_type: 'country',
			state_name: null,
			size_rank: 0,
			points: await fetchFredSeries(s.id)
		});
	}
	await replaceSource('fred', rows);
	return `${rows.length} series, ${rows.reduce((n, r) => n + r.points.length, 0)} observations`;
}

// --- Zillow Research ---

// Zillow's CSVs quote region names that contain commas ("New York, NY"), so a
// plain split won't do. RFC 4180 is all they use: quoted fields, "" for a quote.
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				quoted = false;
			} else {
				field += c;
			}
		} else if (c === '"') {
			quoted = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += c;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

const ZILLOW_ID_COLUMNS = ['RegionID', 'SizeRank', 'RegionName', 'RegionType', 'StateName'];

async function fetchZillowDataset(key: string, url: string): Promise<SeriesRow[]> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Zillow ${key}: ${res.status} ${res.statusText}`);
	const [header, ...lines] = parseCsv(await res.text());
	if (!header || ZILLOW_ID_COLUMNS.some((c, i) => header[i] !== c)) {
		// The one thing that would silently corrupt the data is Zillow reordering
		// its columns, so refuse rather than guess.
		throw new Error(`Zillow ${key}: unexpected columns ${header?.slice(0, 5).join(', ')}`);
	}
	const dates = header.slice(ZILLOW_ID_COLUMNS.length);
	return lines
		.filter((cells) => cells.length === header.length)
		.map((cells) => {
			const points: Point[] = [];
			dates.forEach((day, i) => {
				const raw = cells[ZILLOW_ID_COLUMNS.length + i];
				if (raw !== '' && day >= HISTORY_START) points.push([day, Number(raw)]);
			});
			return {
				source: 'zillow',
				key,
				region_id: cells[0],
				region_name: cells[2],
				region_type: cells[3],
				state_name: cells[4] || null,
				size_rank: Number(cells[1]),
				points
			};
		});
}

async function syncZillow(): Promise<string> {
	const rows: SeriesRow[] = [];
	const counts: string[] = [];
	for (const d of ZILLOW_DATASETS) {
		const dataset = await fetchZillowDataset(d.key, d.url);
		rows.push(...dataset);
		counts.push(`${d.key}: ${dataset.length} regions`);
	}
	await replaceSource('zillow', rows);
	return counts.join(', ');
}

// Swap in a source's freshly fetched series in one transaction, so the page
// never sees half a refresh. Anything the source no longer publishes (a metro
// Zillow dropped) is removed: every row this transaction touched has
// fetched_at = now(), which inside a transaction is the moment it began.
async function replaceSource(source: Source, rows: SeriesRow[]): Promise<void> {
	const BATCH = 100;
	await sql.begin(async (tx) => {
		for (let i = 0; i < rows.length; i += BATCH) {
			const batch = rows.slice(i, i + BATCH);
			await tx`
				insert into housing_series
					(source, key, region_id, region_name, region_type, state_name, size_rank, points, fetched_at)
				select source, key, region_id, region_name, region_type, state_name, size_rank, points, now()
				from jsonb_to_recordset(${tx.json(batch as never)}) as x(
					source text, key text, region_id text, region_name text, region_type text,
					state_name text, size_rank int, points jsonb
				)
				on conflict (source, key, region_id) do update set
					region_name = excluded.region_name,
					region_type = excluded.region_type,
					state_name = excluded.state_name,
					size_rank = excluded.size_rank,
					points = excluded.points,
					fetched_at = excluded.fetched_at
			`;
		}
		await tx`delete from housing_series where source = ${source} and fetched_at < now()`;
	});
}

export interface SyncResult {
	source: Source;
	ok: boolean;
	detail: string;
}

// Refresh the named sources (default: all), each independently, so a missing
// FRED key doesn't stop the Zillow pull. Every attempt is logged.
export async function refresh(sources: Source[] = SOURCES): Promise<SyncResult[]> {
	const results: SyncResult[] = [];
	for (const source of sources) {
		let result: SyncResult;
		try {
			const detail = source === 'fred' ? await syncFred() : await syncZillow();
			result = { source, ok: true, detail };
		} catch (err) {
			console.error(`Housing refresh of ${source} failed:`, err);
			result = { source, ok: false, detail: err instanceof Error ? err.message : String(err) };
		}
		await sql`
			insert into housing_syncs (source, ok, detail)
			values (${result.source}, ${result.ok}, ${result.detail})
		`;
		results.push(result);
	}
	return results;
}

// --- reading ---

export interface SyncStatus {
	source: Source;
	lastAttempt: { ok: boolean; detail: string; at: string } | null;
	lastSuccess: string | null;
}

async function syncStatus(): Promise<SyncStatus[]> {
	const rows = await sql<{ source: Source; ok: boolean; detail: string; ran_at: Date }[]>`
		select distinct on (source) source, ok, detail, ran_at
		from housing_syncs order by source, ran_at desc
	`;
	const wins = await sql<{ source: Source; ran_at: Date }[]>`
		select source, max(ran_at) as ran_at from housing_syncs where ok group by source
	`;
	return SOURCES.map((source) => {
		const last = rows.find((r) => r.source === source);
		const win = wins.find((r) => r.source === source);
		return {
			source,
			lastAttempt: last
				? { ok: last.ok, detail: last.detail, at: new Date(last.ran_at).toISOString() }
				: null,
			lastSuccess: win ? new Date(win.ran_at).toISOString() : null
		};
	});
}

export interface Region {
	id: string;
	name: string;
	state: string | null;
}

export interface HousingData {
	regions: Region[];
	region: Region | null;
	zillow: { zhvi: Point[]; zori: Point[] };
	fred: Record<string, Point[]>;
	status: SyncStatus[];
}

// Everything the page renders for one region: that region's Zillow series, the
// national FRED series, and the list of regions to choose from.
export async function loadData(regionId = US_REGION_ID): Promise<HousingData> {
	const regions = await sql<
		{ region_id: string; region_name: string; state_name: string | null }[]
	>`
		select region_id, region_name, state_name
		from housing_series
		where source = 'zillow' and key = 'zhvi'
		order by size_rank
	`;
	const zillowRows = await sql<{ key: 'zhvi' | 'zori'; points: Point[] }[]>`
		select key, points from housing_series
		where source = 'zillow' and region_id = ${regionId}
	`;
	const fredRows = await sql<{ key: string; points: Point[] }[]>`
		select key, points from housing_series where source = 'fred'
	`;

	const list = regions.map((r) => ({ id: r.region_id, name: r.region_name, state: r.state_name }));
	return {
		regions: list,
		region: list.find((r) => r.id === regionId) ?? null,
		zillow: {
			zhvi: zillowRows.find((r) => r.key === 'zhvi')?.points ?? [],
			zori: zillowRows.find((r) => r.key === 'zori')?.points ?? []
		},
		fred: Object.fromEntries(fredRows.map((r) => [r.key, r.points])),
		status: await syncStatus()
	};
}

// --- houses under consideration ---

export class HouseError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

interface HouseRow {
	id: string | number;
	url: string;
	zpid: string | null;
	address: string | null;
	price: string | null; // numeric comes back as text from postgres.js
	beds: string | null;
	baths: string | null;
	sqft: number | null;
	notes: string;
	assumptions: Partial<Assumptions> | null;
	added_by_name: string | null;
	created_at: Date;
}

const num = (v: string | null) => (v === null ? null : Number(v));

function toHouse(r: HouseRow): House {
	return {
		id: Number(r.id),
		url: r.url,
		zpid: r.zpid,
		address: r.address,
		price: num(r.price),
		beds: num(r.beds),
		baths: num(r.baths),
		sqft: r.sqft,
		notes: r.notes,
		assumptions: r.assumptions,
		addedBy: r.added_by_name,
		createdAt: new Date(r.created_at).toISOString()
	};
}

export async function listHouses(): Promise<House[]> {
	const rows = await sql<HouseRow[]>`
		select h.id, h.url, h.zpid, h.address, h.price, h.beds, h.baths, h.sqft, h.notes,
		       h.assumptions, coalesce(u.real_name, u.username) as added_by_name, h.created_at
		from housing_houses h
		left join users u on u.id = h.added_by
		order by h.created_at desc
	`;
	return rows.map(toHouse);
}

export interface HouseFields {
	address?: string | null;
	price?: number | null;
	beds?: number | null;
	baths?: number | null;
	sqft?: number | null;
	notes?: string;
	assumptions?: Partial<Assumptions> | null;
}

// Pull the editable fields out of a request body. Anything absent is left
// alone; an explicit null or '' clears it.
export function readFields(body: Record<string, unknown> | null): HouseFields {
	const out: HouseFields = {};
	const numeric = (key: 'price' | 'beds' | 'baths' | 'sqft', max: number) => {
		if (!body || !(key in body)) return;
		const v = body[key];
		if (v === null || v === '') {
			out[key] = null;
			return;
		}
		const n = Number(v);
		if (!Number.isFinite(n) || n < 0 || n > max) throw new HouseError(`${key} must be a number.`);
		out[key] = key === 'sqft' ? Math.round(n) : n;
	};
	numeric('price', 1e10);
	numeric('beds', 99);
	numeric('baths', 99);
	numeric('sqft', 1e7);

	if (body && 'address' in body) {
		const s = typeof body.address === 'string' ? body.address.trim().slice(0, 200) : '';
		out.address = s || null;
	}
	if (body && 'notes' in body) {
		out.notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : '';
	}
	if (body && 'assumptions' in body) out.assumptions = readAssumptions(body.assumptions);
	return out;
}

// Only known keys, only finite numbers. The page can't smuggle anything else
// into the jsonb column, and a stored set never carries a NaN that would
// poison every number derived from it.
function readAssumptions(v: unknown): Partial<Assumptions> | null {
	if (v === null || typeof v !== 'object') return null;
	const out: Partial<Assumptions> = {};
	for (const key of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]) {
		const n = Number((v as Record<string, unknown>)[key]);
		if ((v as Record<string, unknown>)[key] !== undefined && Number.isFinite(n)) out[key] = n;
	}
	return out;
}

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function addHouse(
	userId: number | null,
	rawUrl: string,
	fields: HouseFields
): Promise<void> {
	const parsed = parseZillowUrl(rawUrl);
	if (!parsed) throw new HouseError('That is not a Zillow link.');
	try {
		await sql`
			insert into housing_houses
				(url, zpid, address, price, beds, baths, sqft, notes, assumptions, added_by)
			values (
				${parsed.url}, ${parsed.zpid}, ${fields.address ?? parsed.address},
				${fields.price ?? null}, ${fields.beds ?? null}, ${fields.baths ?? null},
				${fields.sqft ?? null}, ${fields.notes ?? ''},
				${fields.assumptions ? sql.json(fields.assumptions as never) : null}, ${userId}
			)
		`;
	} catch (err) {
		if (isUniqueViolation(err)) throw new HouseError('That house is already on the list.', 409);
		throw err;
	}
}

export async function updateHouse(id: number, fields: HouseFields): Promise<void> {
	const set: Record<string, unknown> = {};
	for (const key of ['address', 'price', 'beds', 'baths', 'sqft', 'notes'] as const) {
		if (key in fields) set[key] = fields[key];
	}
	if ('assumptions' in fields) {
		set.assumptions = fields.assumptions ? sql.json(fields.assumptions as never) : null;
	}
	if (!Object.keys(set).length) return;
	const rows = await sql`
		update housing_houses set ${sql(set)}, updated_at = now() where id = ${id} returning id
	`;
	if (!rows.length) throw new HouseError(`No house with id ${id}.`, 404);
}

export async function deleteHouse(id: number): Promise<void> {
	await sql`delete from housing_houses where id = ${id}`;
}
