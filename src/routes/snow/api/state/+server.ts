// src/routes/snow/api/state/+server.ts
// Everything both snow pages render, in one request.
//
// Public, but the answer depends on who is asking: until a season locks, this
// is where other people's dates get stripped out (loadState -> canSeeAll). That
// makes the response uncacheable by anything shared — no-store, not max-age.
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import { SNOW_ADMIN_ROLE, listAccounts, loadState } from '$lib/server/snow';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	const slug = url.searchParams.get('season') ?? undefined;
	const state = await loadState(locals.user, slug);

	// Only the admin page uses this, and only to link an entry to a login.
	const accounts = hasRole(locals.user, SNOW_ADMIN_ROLE) ? await listAccounts() : [];

	return json({ ok: true, ...state, accounts }, { headers: { 'cache-control': 'no-store' } });
};
