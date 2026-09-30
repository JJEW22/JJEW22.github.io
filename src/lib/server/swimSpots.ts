// src/lib/server/swimSpots.ts
// Reading and writing swim_spots. The shape it hands back is $lib/swimSpots'
// SwimSpot, so the map and the admin grid consume identical rows.

import { sql } from '$lib/server/db';
import type { SwimSpot } from '$lib/swimSpots';

// site:admin implies this one, via hasRole().
export const SWIM_ADMIN_ROLE = 'mesoup:admin';

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

// Newest swim first, undated spots last, then alphabetical so the order is stable
// across reloads instead of whatever the planner felt like.
export async function listSpots(): Promise<SwimSpot[]> {
	const rows = await sql<Row[]>`
		select ${columns()} from swim_spots
		order by swum_on desc nulls last, name asc
	`;
	return rows.map(toSpot);
}

type NewSpot = Omit<SwimSpot, 'id'>;

export async function createSpot(spot: NewSpot): Promise<SwimSpot> {
	const [row] = await sql<Row[]>`
		insert into swim_spots (name, lat, lon, swum_on, water_type, country, region, note)
		values (
			${spot.name}, ${spot.lat}, ${spot.lon}, ${spot.swumOn},
			${spot.waterType}, ${spot.country}, ${spot.region}, ${spot.note}
		)
		returning ${columns()}
	`;
	return toSpot(row);
}

// Null when the id doesn't exist, so the endpoint can answer 404 rather than
// reporting a save that didn't happen.
export async function updateSpot(id: number, spot: NewSpot): Promise<SwimSpot | null> {
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
		where id = ${id}
		returning ${columns()}
	`;
	return row ? toSpot(row) : null;
}

export async function deleteSpot(id: number): Promise<boolean> {
	const rows = await sql`delete from swim_spots where id = ${id} returning id`;
	return rows.length > 0;
}
