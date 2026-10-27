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
	RATING_MAX,
	type Point,
	type Rating,
	type RentcastDetails
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
	rentcast: RentcastDetails | null;
	lat: number | null;
	lng: number | null;
	ratings: Rating[];
	eliminated_at: Date | null;
	eliminated_by_name: string | null;
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
		rentcast: r.rentcast,
		lat: r.lat,
		lng: r.lng,
		ratings: r.ratings ?? [],
		eliminatedAt: r.eliminated_at ? new Date(r.eliminated_at).toISOString() : null,
		eliminatedBy: r.eliminated_by_name,
		addedBy: r.added_by_name,
		createdAt: new Date(r.created_at).toISOString()
	};
}

export async function listHouses(): Promise<House[]> {
	await locatePending();
	const rows = await sql<HouseRow[]>`
		select h.id, h.url, h.zpid, h.address, h.price, h.beds, h.baths, h.sqft, h.notes,
		       h.assumptions, h.rentcast, h.lat, h.lng,
		       coalesce((
		           select json_agg(json_build_object(
		                      'userId', r.user_id,
		                      'name', coalesce(ru.real_name, ru.username),
		                      'score', r.score,
		                      'wouldntBuy', r.wouldnt_buy,
		                      'wouldntRent', r.wouldnt_rent,
		                      'comment', r.comment,
		                      'updatedAt', r.updated_at
		                  ) order by r.updated_at desc)
		           from housing_house_ratings r join users ru on ru.id = r.user_id
		           where r.house_id = h.id
		       ), '[]') as ratings,
		       h.eliminated_at, coalesce(eu.real_name, eu.username) as eliminated_by_name,
		       coalesce(u.real_name, u.username) as added_by_name,
		       h.created_at
		from housing_houses h
		left join users u on u.id = h.added_by
		left join users eu on eu.id = h.eliminated_by
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
		// The column is an int; refuse a fraction rather than quietly rounding it.
		if (key === 'sqft' && !Number.isInteger(n)) {
			throw new HouseError('sqft must be a whole number.');
		}
		out[key] = n;
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
): Promise<number> {
	const parsed = parseZillowUrl(rawUrl);
	if (!parsed) throw new HouseError('That is not a Zillow link.');
	try {
		const [row] = await sql<{ id: string | number }[]>`
			insert into housing_houses
				(url, zpid, address, price, beds, baths, sqft, notes, assumptions, added_by)
			values (
				${parsed.url}, ${parsed.zpid}, ${fields.address ?? parsed.address},
				${fields.price ?? null}, ${fields.beds ?? null}, ${fields.baths ?? null},
				${fields.sqft ?? null}, ${fields.notes ?? ''},
				${fields.assumptions ? sql.json(fields.assumptions as never) : null}, ${userId}
			)
			returning id
		`;
		return Number(row.id);
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
	// A new address needs placing on the map again; the next list does it.
	if ('address' in fields) {
		set.lat = null;
		set.lng = null;
		set.geocoded_at = null;
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

// --- RentCast ---
//
// Zillow won't serve its listing pages to a server, so the details come from
// RentCast instead, looked up by the address in the Zillow link. Each lookup
// spends 3-4 of the free plan's 50 requests a month: the sale listing (asking
// price), the property record (beds, baths, taxes, HOA), the rent estimate, and
// a value estimate only when the home isn't listed for sale. A lookup happens
// once, when a house is added (or on "Update from RentCast"); after that only
// the weekly listing check below touches RentCast, a request per ZIP code.

const RENTCAST_BASE = 'https://api.rentcast.io/v1';
export const RENTCAST_MONTHLY_LIMIT = 50;
// Lookups stop once this many requests are spent in a month. A lookup costs up
// to 4, so one started at 39 still ends under 50, and the margin covers the
// count here being by calendar month while RentCast's resets on the billing
// date. Past 50 RentCast bills per request, so stopping short is the point.
export const RENTCAST_STOP_AT = 40;

export function rentcastConfigured(): boolean {
	return Boolean(env.RENTCAST_API_KEY);
}

class NotFound extends Error {}

async function rentcastGet<T>(path: string, address: string): Promise<T> {
	const res = await fetch(`${RENTCAST_BASE}${path}?${new URLSearchParams({ address })}`, {
		headers: { 'X-Api-Key': env.RENTCAST_API_KEY ?? '', accept: 'application/json' }
	});
	if (res.status === 404) throw new NotFound();
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(`${path}: ${res.status} ${body?.message ?? res.statusText}`);
	}
	return res.json();
}

// The slices of RentCast's responses this reads.
interface RcListing {
	price?: number;
	status?: string;
	listedDate?: string;
	formattedAddress?: string;
}
interface RcProperty {
	formattedAddress?: string;
	latitude?: number;
	longitude?: number;
	propertyType?: string;
	bedrooms?: number;
	bathrooms?: number;
	squareFootage?: number;
	lotSize?: number;
	yearBuilt?: number;
	lastSalePrice?: number;
	lastSaleDate?: string;
	hoa?: { fee?: number };
	propertyTaxes?: Record<string, { year?: number; total?: number }>;
}
interface RcEstimate {
	price?: number;
	priceRangeLow?: number;
	priceRangeHigh?: number;
	rent?: number;
	rentRangeLow?: number;
	rentRangeHigh?: number;
}

const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export async function lookupRentcast(address: string): Promise<RentcastDetails> {
	return (await lookupRentcastWithCoords(address)).details;
}

// The coordinates aren't part of RentcastDetails (the house's own lat/lng
// columns hold them), so they come back alongside.
async function lookupRentcastWithCoords(
	address: string
): Promise<{ details: RentcastDetails; coords: { lat: number; lng: number } | null }> {
	if (!env.RENTCAST_API_KEY) throw new HouseError('RENTCAST_API_KEY is not set.', 503);
	const errors: string[] = [];
	let calls = 0;

	// One endpoint failing (or knowing nothing about the address) shouldn't sink
	// the others, so each is tried on its own. A 404 is "no data", not an error.
	async function attempt<T>(path: string): Promise<T | null> {
		calls++;
		try {
			return await rentcastGet<T>(path, address);
		} catch (err) {
			if (!(err instanceof NotFound)) errors.push(err instanceof Error ? err.message : String(err));
			return null;
		}
	}

	const listings = await attempt<RcListing[]>('/listings/sale');
	const active = (listings ?? []).find((l) => l.status === 'Active' && pos(l.price));
	const properties = await attempt<RcProperty[]>('/properties');
	const p = properties?.[0];
	const rent = await attempt<RcEstimate>('/avm/rent/long-term');
	const value = active ? null : await attempt<RcEstimate>('/avm/value');

	const taxes = Object.values(p?.propertyTaxes ?? {})
		.filter((t) => pos(t.year) && pos(t.total))
		.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

	const coords =
		typeof p?.latitude === 'number' && typeof p?.longitude === 'number'
			? { lat: p.latitude, lng: p.longitude }
			: null;

	const details: RentcastDetails = {
		lookedUpAt: new Date().toISOString(),
		matchedAddress: p?.formattedAddress ?? active?.formattedAddress ?? null,
		listing: active
			? { price: active.price as number, status: 'Active', listedDate: active.listedDate ?? null }
			: null,
		valueEstimate: pos(value?.price)
			? {
					price: value?.price as number,
					low: pos(value?.priceRangeLow),
					high: pos(value?.priceRangeHigh)
				}
			: null,
		rentEstimate: pos(rent?.rent)
			? { rent: rent?.rent as number, low: pos(rent?.rentRangeLow), high: pos(rent?.rentRangeHigh) }
			: null,
		propertyType: p?.propertyType ?? null,
		beds: typeof p?.bedrooms === 'number' ? p.bedrooms : null,
		baths: pos(p?.bathrooms),
		sqft: pos(p?.squareFootage),
		lotSize: pos(p?.lotSize),
		yearBuilt: pos(p?.yearBuilt),
		lastSale: pos(p?.lastSalePrice)
			? { price: p?.lastSalePrice as number, date: p?.lastSaleDate ?? null }
			: null,
		hoaMonthly: pos(p?.hoa?.fee),
		annualTax: taxes[0] ? { year: taxes[0].year as number, total: taxes[0].total as number } : null,
		calls,
		errors
	};
	return { details, coords };
}

// Look a house up and store the result. Its price, beds, baths and sqft are
// filled from RentCast only where empty, unless `overwrite` (the page's
// "Update from RentCast"), so a figure someone typed in is never silently
// replaced. Returns a one-line summary for the page.
export async function refreshFromRentcast(id: number, overwrite: boolean): Promise<string> {
	const [house] = await sql<HouseRow[]>`
		select id, address, price, beds, baths, sqft, lat, eliminated_at
		from housing_houses where id = ${id}
	`;
	if (!house) throw new HouseError(`No house with id ${id}.`, 404);
	if (house.eliminated_at) {
		throw new HouseError(
			'This house is eliminated, so it is not looked up. Restore it first.',
			409
		);
	}
	if (!house.address) throw new HouseError('This house needs an address to look up.');
	// Checked here, where every lookup passes, rather than only in the page.
	const usage = await rentcastUsage();
	if (usage.paused) throw new HouseError(rentcastPausedMessage(usage.used), 429);

	const { details: d, coords } = await lookupRentcastWithCoords(house.address);
	await sql`
		insert into housing_syncs (source, ok, detail, calls)
		values ('rentcast', ${!d.errors.length}, ${`${house.address}: ${d.errors.join('; ') || 'ok'}`},
		        ${d.calls})
	`;

	const found = {
		price: d.listing?.price ?? d.valueEstimate?.price ?? null,
		beds: d.beds,
		baths: d.baths,
		sqft: d.sqft === null ? null : Math.round(d.sqft)
	};
	const set: Record<string, unknown> = { rentcast: sql.json(d as never) };
	if (house.lat === null && coords) {
		set.lat = coords.lat;
		set.lng = coords.lng;
		set.geocoded_at = new Date();
	}
	const filled: string[] = [];
	for (const key of ['price', 'beds', 'baths', 'sqft'] as const) {
		if (found[key] !== null && (overwrite || house[key] === null)) {
			set[key] = found[key];
			filled.push(key);
		}
	}
	await sql`update housing_houses set ${sql(set)}, updated_at = now() where id = ${id}`;

	if (d.errors.length) return `RentCast had trouble: ${d.errors.join('; ')}`;
	if (!d.matchedAddress && !d.listing && !d.rentEstimate && !d.valueEstimate) {
		return `RentCast has no record of ${house.address}. Check the address, then try again.`;
	}
	const priceFrom = d.listing ? 'asking price' : 'value estimate';
	return filled.length
		? `Filled from RentCast: ${filled.map((k) => (k === 'price' ? `price (${priceFrom})` : k)).join(', ')}.`
		: 'Looked up on RentCast. Nothing was empty, so nothing was changed.';
}

// RentCast requests spent this calendar month. The free plan resets on the
// account's billing date, which may not be the 1st, so this is a guide.
export async function rentcastUsage(): Promise<{
	used: number;
	limit: number;
	stopAt: number;
	paused: boolean;
	configured: boolean;
}> {
	const [row] = await sql<{ used: number }[]>`
		select coalesce(sum(calls), 0)::int as used from housing_syncs
		where source = 'rentcast' and ran_at >= date_trunc('month', now())
	`;
	return {
		used: row.used,
		limit: RENTCAST_MONTHLY_LIMIT,
		stopAt: RENTCAST_STOP_AT,
		paused: row.used >= RENTCAST_STOP_AT,
		configured: rentcastConfigured()
	};
}

export function rentcastPausedMessage(used: number): string {
	return (
		`RentCast autofill is paused until next month: ${used} of the ` +
		`${RENTCAST_MONTHLY_LIMIT} free requests are used, and lookups stop at ` +
		`${RENTCAST_STOP_AT} so the free plan is never exceeded. Fill the details in by hand.`
	);
}

// --- map ---
//
// The US Census geocoder: free, no key, public-domain data. It only knows US
// addresses, which is all Zillow has.

async function geocode(
	address: string
): Promise<{ lat: number; lng: number; zip: string | null } | null> {
	const params = new URLSearchParams({
		address,
		benchmark: 'Public_AR_Current',
		format: 'json'
	});
	const res = await fetch(
		`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`,
		{ signal: AbortSignal.timeout(10_000) }
	);
	if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
	const data = await res.json();
	const match = data?.result?.addressMatches?.[0];
	const c = match?.coordinates;
	if (typeof c?.x !== 'number' || typeof c?.y !== 'number') return null;
	const zip = match?.addressComponents?.zip;
	return { lat: c.y, lng: c.x, zip: typeof zip === 'string' && /^\d{5}$/.test(zip) ? zip : null };
}

// Place any house that has an address but hasn't been tried yet. A handful per
// call, so a backlog never makes one page load slow; a failure leaves
// geocoded_at null to retry next time, while "no match" records the attempt.
async function locatePending(limit = 5): Promise<void> {
	const pending = await sql<{ id: string | number; address: string }[]>`
		select id, address from housing_houses
		where address is not null and lat is null and geocoded_at is null
		order by created_at desc limit ${limit}
	`;
	for (const h of pending) {
		try {
			const at = await geocode(h.address);
			// An address without a ZIP can't be grouped for the weekly listing
			// check, so take the geocoder's.
			const address = at?.zip && !zipOf(h.address) ? `${h.address.trim()} ${at.zip}` : h.address;
			await sql`
				update housing_houses
				set lat = ${at?.lat ?? null}, lng = ${at?.lng ?? null}, address = ${address},
				    geocoded_at = now()
				where id = ${h.id}
			`;
		} catch (err) {
			console.warn(`Geocoding ${h.address} failed:`, err);
		}
	}
}

// --- ratings ---

// Set (or, with a null score, remove) one admin's rating of a house. The
// wouldn't-buy / wouldn't-rent toggles ride along with the score; they are
// never set without one.
export async function setRating(
	houseId: number,
	userId: number,
	score: number | null,
	flags: { wouldntBuy: boolean; wouldntRent: boolean },
	comment: string
): Promise<void> {
	// An eliminated house's ratings stay as they were when it went; the page
	// shows them read-only, and this keeps them that way.
	const [house] = await sql<{ eliminated_at: Date | null }[]>`
		select eliminated_at from housing_houses where id = ${houseId}
	`;
	if (house?.eliminated_at) {
		throw new HouseError('This house is eliminated. Restore it to change its ratings.', 409);
	}
	if (score === null) {
		if (flags.wouldntBuy || flags.wouldntRent) {
			throw new HouseError(`Pick a score from 1 to ${RATING_MAX} to go with the toggles.`);
		}
		await sql`delete from housing_house_ratings where house_id = ${houseId} and user_id = ${userId}`;
		return;
	}
	if (!Number.isInteger(score) || score < 1 || score > RATING_MAX) {
		throw new HouseError(`A rating is a whole number from 1 to ${RATING_MAX}.`);
	}
	try {
		await sql`
			insert into housing_house_ratings
				(house_id, user_id, score, wouldnt_buy, wouldnt_rent, comment)
			values (${houseId}, ${userId}, ${score}, ${flags.wouldntBuy}, ${flags.wouldntRent},
			        ${comment.slice(0, 1000)})
			on conflict (house_id, user_id) do update set
				score = excluded.score,
				wouldnt_buy = excluded.wouldnt_buy,
				wouldnt_rent = excluded.wouldnt_rent,
				comment = excluded.comment,
				updated_at = now()
		`;
	} catch (err) {
		// 23503: the house was removed while the rating was being made.
		if ((err as { code?: string }).code === '23503') {
			throw new HouseError(`No house with id ${houseId}.`, 404);
		}
		throw err;
	}
}

// --- weekly listing check ---
//
// RentCast has no request that returns everything for a list of addresses:
// property records and estimates are one request per address. Its sale
// listings search, though, takes a ZIP code and returns up to 500 active
// listings at once. So once a week this makes one request per ZIP code the
// active houses are in, and matches each house to its listing by address. That
// catches price changes and homes taken off the market, for far fewer requests
// than looking each house up. Full details still come from the lookup made when
// a house is added.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LISTINGS_PER_REQUEST = 500;

const STREET_WORDS: Record<string, string> = {
	street: 'st',
	avenue: 'ave',
	road: 'rd',
	drive: 'dr',
	lane: 'ln',
	terrace: 'ter',
	place: 'pl',
	court: 'ct',
	boulevard: 'blvd',
	parkway: 'pkwy',
	circle: 'cir',
	square: 'sq',
	highway: 'hwy',
	north: 'n',
	south: 's',
	east: 'e',
	west: 'w',
	apartment: '#',
	apt: '#',
	unit: '#',
	ste: '#',
	suite: '#',
	building: '#',
	bldg: '#'
};

// "66 Round Hill Street, Apt 2" and "66 ROUND HILL ST #2" compare equal.
function streetKey(line: string): string {
	return line
		.toLowerCase()
		.replace(/[.,]/g, ' ')
		.replace(/#/g, ' # ')
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => STREET_WORDS[w] ?? w)
		.join(' ');
}

// The street (number and name) and the unit, apart: "64 bartlett st" + "4".
function streetParts(line: string): { base: string; unit: string | null } {
	const words = streetKey(line).split(' ');
	const i = words.indexOf('#');
	if (i < 0) return { base: words.join(' '), unit: null };
	return { base: words.slice(0, i).join(' '), unit: words.slice(i + 1).join(' ') || null };
}

// The listing for a house, or null when there's none or more than one could be
// it. Street must agree; the unit decides between listings at one address, and
// a house with no unit only matches an address with a single listing.
function findListing<T extends { base: string; unit: string | null }>(
	house: { base: string; unit: string | null },
	listings: T[]
): T | null {
	const same = listings.filter((l) => l.base === house.base);
	if (house.unit) {
		return (
			same.find((l) => l.unit === house.unit) ??
			(same.length === 1 && !same[0].unit ? same[0] : null)
		);
	}
	return same.length === 1 ? same[0] : null;
}

function zipOf(address: string): string | null {
	return address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? null;
}

interface RcSaleListing {
	addressLine1?: string;
	addressLine2?: string;
	formattedAddress?: string;
	price?: number;
	status?: string;
	listedDate?: string;
}

export interface ListingCheckResult {
	ran: boolean;
	detail: string;
}

// Run the weekly check. Skips itself if one ran in the last 6 days, unless
// `force`, so the workflow can fire on a schedule without double-spending.
// Never goes past RENTCAST_STOP_AT: ZIP codes that don't fit wait a week.
export async function checkListings(force = false): Promise<ListingCheckResult> {
	if (!env.RENTCAST_API_KEY) return { ran: false, detail: 'RENTCAST_API_KEY is not set.' };

	if (!force) {
		const [last] = await sql<{ ran_at: Date }[]>`
			select ran_at from housing_syncs
			where source = 'rentcast' and detail like 'Weekly listing check%'
			order by ran_at desc limit 1
		`;
		if (last && Date.now() - new Date(last.ran_at).getTime() < WEEK_MS - 24 * 60 * 60 * 1000) {
			return { ran: false, detail: `Already checked ${new Date(last.ran_at).toISOString()}.` };
		}
	}

	const houses = await sql<HouseRow[]>`
		select id, address, price, rentcast from housing_houses
		where eliminated_at is null and address is not null
	`;
	const byZip = new Map<string, HouseRow[]>();
	for (const h of houses) {
		const zip = zipOf(h.address as string);
		if (zip) byZip.set(zip, [...(byZip.get(zip) ?? []), h]);
	}
	if (!byZip.size) return { ran: false, detail: 'No active houses with a ZIP code to check.' };

	const usage = await rentcastUsage();
	const budget = Math.max(RENTCAST_STOP_AT - usage.used, 0);
	const zips = [...byZip.keys()].slice(0, budget);
	const skipped = byZip.size - zips.length;

	let calls = 0;
	let changed = 0;
	let delisted = 0;
	const errors: string[] = [];
	const now = new Date().toISOString();

	for (const zip of zips) {
		calls++;
		let listings: RcSaleListing[];
		try {
			const params = new URLSearchParams({
				zipCode: zip,
				status: 'Active',
				limit: String(LISTINGS_PER_REQUEST)
			});
			const res = await fetch(`${RENTCAST_BASE}/listings/sale?${params}`, {
				headers: { 'X-Api-Key': env.RENTCAST_API_KEY ?? '', accept: 'application/json' }
			});
			if (res.status === 404) listings = [];
			else if (!res.ok) throw new Error(`${zip}: ${res.status} ${res.statusText}`);
			else listings = await res.json();
		} catch (err) {
			errors.push(err instanceof Error ? err.message : String(err));
			continue;
		}
		// A full page means there may be more; a house missing from it can't be
		// called delisted, only left as it was.
		const complete = listings.length < LISTINGS_PER_REQUEST;
		const parsed = listings.map((l) => ({
			...streetParts(
				[l.addressLine1, l.addressLine2].filter(Boolean).join(' ') ||
					(l.formattedAddress ?? '').split(',')[0]
			),
			listing: l
		}));

		for (const h of byZip.get(zip) ?? []) {
			const match = findListing(streetParts((h.address as string).split(',')[0]), parsed)?.listing;
			const prev = h.rentcast;
			const prevPrice = prev?.listing?.price ?? null;
			const found =
				match && typeof match.price === 'number' && match.price > 0
					? { price: match.price, status: 'Active', listedDate: match.listedDate ?? null }
					: null;

			// No match is only "no longer listed" for a house that was matched
			// before, against a complete page. Otherwise it's an address the
			// check couldn't pair up, and the listing is left as it was.
			const delistedNow = !found && Boolean(prev?.listing) && complete;
			const listing = found ?? (delistedNow ? null : (prev?.listing ?? null));
			if (delistedNow) delisted++;

			const history = [...(prev?.priceHistory ?? [])];
			if (found && history.at(-1)?.price !== found.price) {
				history.push({ date: now, price: found.price });
				// The first price seen isn't a change.
				if (prevPrice !== null && found.price !== prevPrice) changed++;
			}

			const details = {
				...(prev ?? emptyDetails()),
				listing,
				listingCheckedAt: now,
				listingUnmatched: !found && !delistedNow,
				priceHistory: history.slice(-24)
			};
			const set: Record<string, unknown> = { rentcast: sql.json(details as never) };
			// Follow the asking price only while the house's price is still the one
			// RentCast gave; a price someone typed in stays theirs.
			const current = num(h.price);
			if (listing && (current === null || current === prevPrice)) set.price = listing.price;
			await sql`update housing_houses set ${sql(set)}, updated_at = now() where id = ${h.id}`;
		}
	}

	const detail =
		`Weekly listing check: ${zips.length} ZIP code${zips.length === 1 ? '' : 's'}, ` +
		`${changed} price change${changed === 1 ? '' : 's'}, ${delisted} no longer listed` +
		(skipped
			? `, ${skipped} ZIP code${skipped === 1 ? '' : 's'} left for next week (request cap)`
			: '') +
		(errors.length ? `; failed: ${errors.join('; ')}` : '');
	await sql`
		insert into housing_syncs (source, ok, detail, calls)
		values ('rentcast', ${!errors.length}, ${detail}, ${calls})
	`;
	return { ran: true, detail };
}

function emptyDetails(): RentcastDetails {
	return {
		lookedUpAt: new Date().toISOString(),
		matchedAddress: null,
		listing: null,
		valueEstimate: null,
		rentEstimate: null,
		propertyType: null,
		beds: null,
		baths: null,
		sqft: null,
		lotSize: null,
		yearBuilt: null,
		lastSale: null,
		hoaMonthly: null,
		annualTax: null,
		calls: 0,
		errors: []
	};
}

// --- eliminating ---

export async function setEliminated(id: number, userId: number | null, eliminated: boolean) {
	const rows = await sql`
		update housing_houses
		set eliminated_at = ${eliminated ? new Date() : null},
		    eliminated_by = ${eliminated ? userId : null},
		    updated_at = now()
		where id = ${id}
		returning id
	`;
	if (!rows.length) throw new HouseError(`No house with id ${id}.`, 404);
}
