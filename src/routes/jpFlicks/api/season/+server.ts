// src/routes/jpFlicks/api/season/+server.ts
// Everything the league page renders, in one request.
//
// This is what replaced fetching and parsing jpFlicksSeason2.xlsx in the
// browser. The `sheets` key is deliberately the same {json, array, headers,
// rows} shape XLSX produced, so the page's standings and scheduling code did
// not have to change to follow the data into the database.
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import { JPFLICKS_ADMIN_ROLE, listAccounts, loadState } from '$lib/server/jpFlicks';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	const slug = url.searchParams.get('season') ?? undefined;
	const state = await loadState(locals.user, slug);

	// Only the admin page needs these, and only to link a player to a login.
	const accounts = hasRole(locals.user, JPFLICKS_ADMIN_ROLE) ? await listAccounts() : [];

	// Per-user (the submit/approve flags differ by viewer), so nothing shared may
	// cache it.
	return json({ ok: true, ...state, accounts }, { headers: { 'cache-control': 'no-store' } });
};
