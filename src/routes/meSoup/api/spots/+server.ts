// src/routes/meSoup/api/spots/+server.ts
// The public list behind one person's map. Read-only and unauthenticated --
// where someone has swum is the point of the page. With no ?user= it's the
// site owner's map.
import { json } from '@sveltejs/kit';
import { findOwner, listSpots, listWaterTypes } from '$lib/server/swimSpots';
import { MESOUP_OWNER } from '$lib/swimSpots';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url }) => {
	const username = url.searchParams.get('user')?.trim() || MESOUP_OWNER;
	const owner = await findOwner(username);
	if (!owner) return json({ ok: false, error: `No one called ${username}.` }, { status: 404 });

	const [spots, waterTypes] = await Promise.all([listSpots(owner.id), listWaterTypes(owner.id)]);
	return json(
		{ ok: true, owner: owner.username, spots, waterTypes },
		// The map is worth re-fetching now and then but not on every navigation,
		// and a spot added in the admin page is not urgent enough to skip the cache.
		{ headers: { 'cache-control': 'public, max-age=60' } }
	);
};
