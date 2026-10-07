// src/routes/ultra/api/track/+server.ts
// The public track: the devices switched on in /ultra/admin, inside the window
// the display mode allows. An ultra admin can add ?preview=1 to see the last
// 24 hours instead, to check a phone before anything is public.
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import { ULTRA_ADMIN_ROLE, loadTrack } from '$lib/server/ultra';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	const isAdmin = hasRole(locals.user, ULTRA_ADMIN_ROLE);
	const preview = isAdmin && url.searchParams.get('preview') === '1';
	const track = await loadTrack(preview);
	return json({ ok: true, isAdmin, ...track }, { headers: { 'cache-control': 'no-store' } });
};
