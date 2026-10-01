// src/routes/meSoup/api/users/+server.ts
// Username suggestions for the tag box on /meSoup/admin. Signed-in only, prefix
// matches only, eight at most: enough to finish a name you half remember, not a
// way to list every account on the site.
import { error, json } from '@sveltejs/kit';
import { searchUsers } from '$lib/server/swimSpots';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to tag people.');
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return json({ ok: true, users: [] });
	return json(
		{ ok: true, users: await searchUsers(q.slice(0, 40), locals.user.id) },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
