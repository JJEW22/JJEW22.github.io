// src/routes/ultra/api/track/+server.ts
// The public track: only points inside the race window. A site admin can add
// ?preview=1 to see the last 24 hours instead, to test the phone before race day.
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import { loadTrack } from '$lib/server/ultra';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	const isAdmin = hasRole(locals.user, 'site:admin');
	const preview = isAdmin && url.searchParams.get('preview') === '1';
	const track = await loadTrack(preview);
	return json({ ok: true, isAdmin, ...track }, { headers: { 'cache-control': 'no-store' } });
};
