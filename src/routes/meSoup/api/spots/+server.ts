// src/routes/meSoup/api/spots/+server.ts
// The public list behind the map. Read-only and unauthenticated -- where I've
// swum is the point of the page.
import { json } from '@sveltejs/kit';
import { listSpots } from '$lib/server/swimSpots';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async () => {
	const spots = await listSpots();
	return json(
		{ ok: true, spots },
		// The map is worth re-fetching now and then but not on every navigation,
		// and a spot added in the admin page is not urgent enough to skip the cache.
		{ headers: { 'cache-control': 'public, max-age=60' } }
	);
};
