// src/lib/server/swimSpots.ts
// Reading and writing swim_spots. The shape it hands back is $lib/swimSpots'
// SwimSpot, so the map and the admin grid consume identical rows.
//
// Every spot belongs to one user, and every function here takes that user's id:
// there is no "all spots" query, so one person's edit can never reach another
// person's map.

import { sql } from '$lib/server/db';
import { CUSTOM_TYPE_COLORS, WATER_TYPES, waterTypeId, withCustomTypes } from '$lib/swimSpots';
import type { SwimSpot, WaterTypeMeta } from '$lib/swimSpots';

// swum_on is a `date`, and postgres.js would hand it back as a Date at LOCAL
// midnight -- which, rendered anywhere west of Greenwich, is the day before. The
// column never had a time in it to lose, so it is read out as the text it is.
//
// A function, not a constant: `sql` is a lazy proxy whose first call opens the
// connection, so building this fragment at module scope would need
// DATABASE_URL at import time. The production image has no database
// environment, and SvelteKit's analyse step imports this module during the
// build -- which is exactly how that broke the Render deploy.
const columns = () => sql`
	id,
	name,
	lat,
	lon,
	to_char(swum_on, 'YYYY-MM-DD') as swum_on,
	water_type,
	country,
	region,
	note
`;

interface Row {
	id: string | number;
	name: string;
	lat: number;
	lon: number;
	swum_on: string | null;
	water_type: string;
	country: string | null;
	region: string | null;
	note: string | null;
}

// `id` is a bigint, which postgres.js gives as a string to avoid losing precision.
// Nothing here will ever reach 2^53, and the client compares ids with ===, so it
// is narrowed to a number once, here, rather than at every call site.
function toSpot(r: Row): SwimSpot {
	return {
		id: Number(r.id),
		name: r.name,
		lat: Number(r.lat),
		lon: Number(r.lon),
		swumOn: r.swum_on,
		waterType: r.water_type,
		country: r.country,
		region: r.region,
		note: r.note
	};
}

// The account behind a ?user= on the public map, matched ignoring case like
// logins are. Null for a name nobody has.
export async function findOwner(
	username: string
): Promise<{ id: number; username: string } | null> {
	const [row] = await sql<{ id: string | number; username: string }[]>`
		select id, username from users where lower(username) = lower(${username})
	`;
	return row ? { id: Number(row.id), username: row.username } : null;
}

// Newest swim first, undated spots last, then alphabetical so the order is stable
// across reloads instead of whatever the planner felt like.
export async function listSpots(userId: number): Promise<SwimSpot[]> {
	const rows = await sql<Row[]>`
		select ${columns()} from swim_spots
		where user_id = ${userId}
		order by swum_on desc nulls last, name asc
	`;
	return rows.map(toSpot);
}

type NewSpot = Omit<SwimSpot, 'id'>;

export async function createSpot(userId: number, spot: NewSpot): Promise<SwimSpot> {
	const [row] = await sql<Row[]>`
		insert into swim_spots (user_id, name, lat, lon, swum_on, water_type, country, region, note)
		values (
			${userId}, ${spot.name}, ${spot.lat}, ${spot.lon}, ${spot.swumOn},
			${spot.waterType}, ${spot.country}, ${spot.region}, ${spot.note}
		)
		returning ${columns()}
	`;
	return toSpot(row);
}

// Null when the id doesn't exist -- or belongs to someone else, which the
// endpoint answers the same way, so ids can't be probed for other people's spots.
export async function updateSpot(
	userId: number,
	id: number,
	spot: NewSpot
): Promise<SwimSpot | null> {
	const [row] = await sql<Row[]>`
		update swim_spots set
			name = ${spot.name},
			lat = ${spot.lat},
			lon = ${spot.lon},
			swum_on = ${spot.swumOn},
			water_type = ${spot.waterType},
			country = ${spot.country},
			region = ${spot.region},
			note = ${spot.note},
			updated_at = now()
		where id = ${id} and user_id = ${userId}
		returning ${columns()}
	`;
	return row ? toSpot(row) : null;
}

export async function deleteSpot(userId: number, id: number): Promise<boolean> {
	const rows = await sql`
		delete from swim_spots where id = ${id} and user_id = ${userId} returning id
	`;
	return rows.length > 0;
}

// --- water types ---

// Built-ins plus everything this user has added under "Other", in the order
// they were added.
//
// Until sql/024_swim_water_types.sql has been applied the table doesn't exist;
// that costs the custom types, not the map.
export async function listWaterTypes(userId: number): Promise<WaterTypeMeta[]> {
	try {
		const rows = await sql<WaterTypeMeta[]>`
			select id, label, color from swim_water_types
			where user_id = ${userId}
			order by created_at, id
		`;
		return withCustomTypes(rows);
	} catch (err) {
		if ((err as { code?: string })?.code === '42P01') return WATER_TYPES;
		throw err;
	}
}

// The id for a typed-in label, creating the type if it's new. A label that
// matches a built-in ("lake") or an earlier custom ("Hot Spring" vs "hot
// spring") resolves to that type instead of adding a duplicate. Null when the
// label has nothing usable in it, like "!!!".
export async function ensureWaterType(userId: number, label: string): Promise<string | null> {
	const id = waterTypeId(label);
	if (!id) return null;
	if (WATER_TYPES.some((t) => t.id === id)) return id;

	const [{ n }] = await sql<{ n: number }[]>`
		select count(*)::int as n from swim_water_types where user_id = ${userId}
	`;
	const color = CUSTOM_TYPE_COLORS[n % CUSTOM_TYPE_COLORS.length];
	await sql`
		insert into swim_water_types (user_id, id, label, color)
		values (${userId}, ${id}, ${label.trim()}, ${color})
		on conflict (user_id, id) do nothing
	`;
	return id;
}
