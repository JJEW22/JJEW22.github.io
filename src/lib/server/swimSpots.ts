// src/lib/server/swimSpots.ts
// Reading and writing swim_spots. The shape it hands back is $lib/swimSpots'
// SwimSpot, so the map and the admin grid consume identical rows.
//
// Three ways to read, one per audience:
//   listSpots(me)          -- the admin grid: only what I own, the only rows I can edit
//   listVisibleSpots(me)   -- my signed-in map: mine plus any I've ACCEPTED a tag on
//   listPersonSpots(me, x) -- x's map as I'm allowed to see it: all of it if x
//                             shared it with me, else just x's swims I'm tagged on
//   listPendingTags(me)    -- the banner: tags waiting for me to accept or decline
//   listAnonymousSpots()   -- the signed-out map: everyone's, with nothing that
//                             says whose, when, or exactly where
// Every write takes the owner's id and matches on it, so one person's edit can
// never reach another person's spot.

import { sql } from '$lib/server/db';
import {
	CUSTOM_TYPE_COLORS,
	DEFAULT_WATER_TYPE,
	WATER_TYPES,
	waterType,
	waterTypeId,
	withCustomTypes
} from '$lib/swimSpots';
import type { PendingTag, Sharer, SpotTag, SwimSpot, WaterTypeMeta } from '$lib/swimSpots';

// swum_on is a `date`, and postgres.js would hand it back as a Date at LOCAL
// midnight -- which, rendered anywhere west of Greenwich, is the day before. The
// column never had a time in it to lose, so it is read out as the text it is.
//
// A function, not a constant: `sql` is a lazy proxy whose first call opens the
// connection, so building this at module scope would need DATABASE_URL at
// import time. The production image has no database environment, and
// SvelteKit's analyse step imports this module during the build -- which is
// exactly how that broke the Render deploy.
//
// `tagged` is accepted tags only -- a pending or declined name must not appear
// on anyone's map. `withStatuses` adds every tag and its status, for the
// owner's admin grid and nobody else: whether Sam declined is between Sam and
// the owner.
const selectSpots = (where: ReturnType<typeof sql>, withStatuses = false) => sql<Row[]>`
	select
		s.id,
		s.name,
		s.lat,
		s.lon,
		to_char(s.swum_on, 'YYYY-MM-DD') as swum_on,
		coalesce(
			(
				select array_agg(to_char(d.swum_on, 'YYYY-MM-DD') order by d.swum_on desc)
				from swim_spot_dates d
				where d.spot_id = s.id
			),
			'{}'
		) as dates,
		s.water_type,
		s.country,
		s.region,
		s.note,
		u.username as owner,
		coalesce(
			(
				select array_agg(tu.username order by lower(tu.username))
				from swim_spot_tags t join users tu on tu.id = t.user_id
				where t.spot_id = s.id and t.status = 'accepted'
			),
			'{}'
		) as tagged
		${
			withStatuses
				? sql`,
					coalesce(
						(
							select json_agg(
								json_build_object('username', tu.username, 'status', t.status)
								order by lower(tu.username)
							)
							from swim_spot_tags t join users tu on tu.id = t.user_id
							where t.spot_id = s.id
						),
						'[]'
					) as tags`
				: sql``
		}
	from swim_spots s
	join users u on u.id = s.user_id
	where ${where}
	order by s.swum_on desc nulls last, s.name asc
`;

interface Row {
	id: string | number;
	name: string;
	lat: number;
	lon: number;
	swum_on: string | null;
	dates: string[];
	water_type: string;
	country: string | null;
	region: string | null;
	note: string | null;
	owner: string;
	tagged: string[];
	tags?: SpotTag[];
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
		dates: r.dates ?? [],
		waterType: r.water_type,
		country: r.country,
		region: r.region,
		note: r.note,
		owner: r.owner,
		tagged: r.tagged ?? [],
		...(r.tags ? { tags: r.tags } : {})
	};
}

// Newest swim first, undated spots last, then alphabetical so the order is stable
// across reloads instead of whatever the planner felt like.
export async function listSpots(userId: number): Promise<SwimSpot[]> {
	const rows = await selectSpots(sql`s.user_id = ${userId}`, true);
	return rows.map(toSpot);
}

export async function listVisibleSpots(userId: number): Promise<SwimSpot[]> {
	const rows = await selectSpots(sql`
		s.user_id = ${userId}
		or exists (
			select 1 from swim_spot_tags x
			where x.spot_id = s.id and x.user_id = ${userId} and x.status = 'accepted'
		)
	`);
	return rows.map(toSpot);
}

// Everyone's spots with the person taken out: no name, note, date, owner or
// tags, and custom water types folded into "Other" --
// their labels are free text someone typed, which is exactly what shouldn't be
// published unattributed. Ids are renumbered and the order is by position, so
// neither says anything about who logged what or when.
export async function listAnonymousSpots(): Promise<SwimSpot[]> {
	const rows = await sql<
		{
			lat: number;
			lon: number;
			water_type: string;
			country: string | null;
			region: string | null;
		}[]
	>`
		select lat, lon, water_type, country, region from swim_spots order by lat, lon
	`;
	return rows.map((r, i) => {
		const builtIn = WATER_TYPES.some((t) => t.id === r.water_type);
		const type = builtIn ? r.water_type : DEFAULT_WATER_TYPE;
		return {
			id: i + 1,
			name: waterType(type).label,
			// Exact: where a swim was is the point of the map, and without a
			// name, date or person attached it doesn't say whose.
			lat: Number(r.lat),
			lon: Number(r.lon),
			swumOn: null,
			dates: [],
			waterType: type,
			country: r.country,
			region: r.region,
			note: null
		};
	});
}

type NewSpot = Omit<SwimSpot, 'id' | 'owner' | 'tagged'>;

// Usernames -> user ids, ignoring case the way logins do. Every name has to
// exist: a typo should be an error, not a tag that silently went nowhere. The
// owner is dropped rather than refused -- tagging yourself is harmless and
// already implied.
export async function resolveTags(
	ownerId: number,
	usernames: string[]
): Promise<{ ok: true; ids: number[] } | { ok: false; error: string }> {
	if (!usernames.length) return { ok: true, ids: [] };
	const lowered = usernames.map((u) => u.toLowerCase());
	const rows = await sql<{ id: string | number; username: string }[]>`
		select id, username from users where lower(username) = any(${lowered}::text[])
	`;
	const found = new Set(rows.map((r) => r.username.toLowerCase()));
	const missing = usernames.filter((u) => !found.has(u.toLowerCase()));
	if (missing.length) {
		return { ok: false, error: `No one called ${missing.join(', ')}.` };
	}
	return { ok: true, ids: rows.map((r) => Number(r.id)).filter((id) => id !== ownerId) };
}

// Create (id null) or edit a spot and replace its dates and tags, in one transaction so a
// failed tag write can't leave a spot saved with half its people. Null when an
// edit's id doesn't exist or belongs to someone else -- answered the same way,
// so ids can't be probed for other people's spots.
export async function saveSpot(
	userId: number,
	id: number | null,
	spot: NewSpot,
	taggedIds: number[]
): Promise<number | null> {
	return sql.begin(async (tx) => {
		let spotId: number;
		if (id === null) {
			const [row] = await tx<{ id: string | number }[]>`
				insert into swim_spots (user_id, name, lat, lon, swum_on, water_type, country, region, note)
				values (
					${userId}, ${spot.name}, ${spot.lat}, ${spot.lon}, ${spot.swumOn},
					${spot.waterType}, ${spot.country}, ${spot.region}, ${spot.note}
				)
				returning id
			`;
			spotId = Number(row.id);
		} else {
			const [row] = await tx<{ id: string | number }[]>`
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
				returning id
			`;
			if (!row) return null;
			spotId = Number(row.id);
		}

		// Dates are replaced outright -- unlike tags, nobody else's answer rides
		// on them. swim_spots.swum_on was set to the newest above.
		await tx`delete from swim_spot_dates where spot_id = ${spotId}`;
		if (spot.dates.length) {
			await tx`
				insert into swim_spot_dates ${tx(spot.dates.map((d) => ({ spot_id: spotId, swum_on: d })))}
			`;
		}

		// Diffed, not replaced: someone who already accepted (or declined) keeps
		// their answer when the spot is edited. Only newly added names are asked.
		if (taggedIds.length) {
			await tx`
				delete from swim_spot_tags
				where spot_id = ${spotId} and not (user_id = any(${taggedIds}::bigint[]))
			`;
			await tx`
				insert into swim_spot_tags ${tx(taggedIds.map((u) => ({ spot_id: spotId, user_id: u })))}
				on conflict (spot_id, user_id) do nothing
			`;
		} else {
			await tx`delete from swim_spot_tags where spot_id = ${spotId}`;
		}
		return spotId;
	});
}

// Tags waiting on this user, newest first, with enough of the spot to decide
// on -- but not its note or exact coordinates, which are the owner's until the
// tag is accepted. The water type's label is resolved here because it may be
// one of the owner's custom types, which the tagged user doesn't have.
export async function listPendingTags(userId: number): Promise<PendingTag[]> {
	const rows = await sql<
		{
			spot_id: string | number;
			name: string;
			owner: string;
			swum_on: string | null;
			water_type: string;
			custom_label: string | null;
			country: string | null;
			region: string | null;
		}[]
	>`
		select
			s.id as spot_id,
			s.name,
			u.username as owner,
			to_char(s.swum_on, 'YYYY-MM-DD') as swum_on,
			s.water_type,
			w.label as custom_label,
			s.country,
			s.region
		from swim_spot_tags t
		join swim_spots s on s.id = t.spot_id
		join users u on u.id = s.user_id
		left join swim_water_types w on w.user_id = s.user_id and w.id = s.water_type
		where t.user_id = ${userId} and t.status = 'pending'
		order by t.created_at desc
	`;
	return rows.map((r) => ({
		spotId: Number(r.spot_id),
		name: r.name,
		owner: r.owner,
		swumOn: r.swum_on,
		waterLabel: r.custom_label ?? waterType(r.water_type).label,
		country: r.country,
		region: r.region
	}));
}

// The people whose swims I've accepted a tag on, alphabetically -- one map
// view each on /meSoup.
//
// Two ways in: they shared their whole map with me, or I accepted a tag on
// one of their swims. Someone who did both counts as the whole map.
export async function listSharers(userId: number): Promise<Sharer[]> {
	const rows = await sql<{ username: string; full_map: boolean }[]>`
		select u.username, bool_or(x.full_map) as full_map
		from (
			select owner_id as uid, true as full_map
			from swim_map_shares where viewer_id = ${userId}
			union all
			select s.user_id, false
			from swim_spot_tags t join swim_spots s on s.id = t.spot_id
			where t.user_id = ${userId} and t.status = 'accepted' and s.user_id <> ${userId}
		) x
		join users u on u.id = x.uid
		group by u.username
		order by lower(u.username)
	`;
	return rows.map((r) => ({ username: r.username, fullMap: r.full_map }));
}

// Someone else's map, as much of it as I'm allowed: every spot if they shared
// their map with me, otherwise only their swims I've accepted a tag on. Null
// when there's no such person or they've shared nothing with me -- the same
// answer either way, so it can't be used to check who has an account.
export async function listPersonSpots(
	viewerId: number,
	username: string
): Promise<{ owner: Sharer; ownerId: number; spots: SwimSpot[] } | null> {
	const [owner] = await sql<{ id: string | number; username: string; full_map: boolean }[]>`
		select u.id, u.username,
			exists (
				select 1 from swim_map_shares m where m.owner_id = u.id and m.viewer_id = ${viewerId}
			) as full_map
		from users u
		where lower(u.username) = lower(${username}) and u.id <> ${viewerId}
	`;
	if (!owner) return null;
	const ownerId = Number(owner.id);

	const rows = owner.full_map
		? await selectSpots(sql`s.user_id = ${ownerId}`)
		: await selectSpots(sql`
				s.user_id = ${ownerId}
				and exists (
					select 1 from swim_spot_tags x
					where x.spot_id = s.id and x.user_id = ${viewerId} and x.status = 'accepted'
				)
			`);
	if (!owner.full_map && !rows.length) return null;
	return {
		owner: { username: owner.username, fullMap: owner.full_map },
		ownerId,
		spots: rows.map(toSpot)
	};
}

// --- map shares ---

// Who I've shared my whole map with, alphabetically.
export async function listMapShares(ownerId: number): Promise<string[]> {
	const rows = await sql<{ username: string }[]>`
		select u.username from swim_map_shares m join users u on u.id = m.viewer_id
		where m.owner_id = ${ownerId}
		order by lower(u.username)
	`;
	return rows.map((r) => r.username);
}

export async function addMapShare(
	ownerId: number,
	username: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const [viewer] = await sql<{ id: string | number }[]>`
		select id from users where lower(username) = lower(${username})
	`;
	if (!viewer) return { ok: false, error: `No one called ${username}.` };
	if (Number(viewer.id) === ownerId) return { ok: false, error: "That's you." };
	await sql`
		insert into swim_map_shares (owner_id, viewer_id) values (${ownerId}, ${viewer.id})
		on conflict do nothing
	`;
	return { ok: true };
}

export async function removeMapShare(ownerId: number, username: string): Promise<void> {
	await sql`
		delete from swim_map_shares m using users u
		where m.owner_id = ${ownerId} and m.viewer_id = u.id and lower(u.username) = lower(${username})
	`;
}

// Accept or decline one of my own pending tags. False when there's no such
// tag waiting on me -- already answered, removed by the owner, or someone
// else's.
export async function respondToTag(
	userId: number,
	spotId: number,
	accept: boolean
): Promise<boolean> {
	const rows = await sql`
		update swim_spot_tags
		set status = ${accept ? 'accepted' : 'declined'}, responded_at = now()
		where spot_id = ${spotId} and user_id = ${userId} and status = 'pending'
		returning spot_id
	`;
	return rows.length > 0;
}

export async function deleteSpot(userId: number, id: number): Promise<boolean> {
	const rows = await sql`
		delete from swim_spots where id = ${id} and user_id = ${userId} returning id
	`;
	return rows.length > 0;
}

// For the tag box's suggestions: usernames starting with what's been typed.
// Signed-in callers only (the endpoint checks), and never the caller.
export async function searchUsers(prefix: string, excludeId: number): Promise<string[]> {
	const escaped = prefix.toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c);
	const rows = await sql<{ username: string }[]>`
		select username from users
		where lower(username) like ${escaped + '%'} and id <> ${excludeId}
		order by lower(username)
		limit 8
	`;
	return rows.map((r) => r.username);
}

// --- water types ---

// Until sql/024_swim_water_types.sql has been applied the table doesn't exist;
// that costs the custom types, not the map.
async function customTypes(query: () => Promise<WaterTypeMeta[]>): Promise<WaterTypeMeta[]> {
	try {
		return withCustomTypes(await query());
	} catch (err) {
		if ((err as { code?: string })?.code === '42P01') return WATER_TYPES;
		throw err;
	}
}

// Built-ins plus everything this user has added under "Other", in the order
// they were added. The admin dropdown.
export function listWaterTypes(userId: number): Promise<WaterTypeMeta[]> {
	return customTypes(
		() => sql<WaterTypeMeta[]>`
			select id, label, color from swim_water_types
			where user_id = ${userId}
			order by created_at, id
		`
	);
}

// For the signed-in map: my types, plus those of anyone whose spot I'm tagged
// in, or their custom-typed spots would all draw grey. Where two people made
// the same type, mine wins.
export function listWaterTypesForViewer(userId: number): Promise<WaterTypeMeta[]> {
	return customTypes(
		() => sql<WaterTypeMeta[]>`
			select distinct on (w.id) w.id, w.label, w.color
			from swim_water_types w
			where w.user_id = ${userId}
				or w.user_id in (
					select s.user_id from swim_spots s
					join swim_spot_tags t on t.spot_id = s.id
					where t.user_id = ${userId} and t.status = 'accepted'
				)
			order by w.id, (w.user_id = ${userId}) desc, w.created_at
		`
	);
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
