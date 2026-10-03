// src/routes/krillion/api/mine/+server.ts
// A signed-in player's stored dives, newest first.
import { json } from '@sveltejs/kit';
import { mySubmissions } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ ok: true, signedIn: false, dives: [] });
	return json(
		{
			ok: true,
			signedIn: true,
			username: locals.user.username,
			dives: await mySubmissions(locals.user.id)
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
