// src/routes/housing/api/admin/listings/+server.ts
// The weekly RentCast listing check: one request per ZIP code the active
// houses are in, refreshing each one's asking price and whether it is still
// listed. .github/workflows/housing-refresh.yml calls this weekly with
// SYNC_SECRET; it skips itself if a check ran in the last 6 days.
//
//   POST { force?: true }   run even if one ran this week (still capped at
//                           RENTCAST_STOP_AT requests a month)
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { HOUSING_ADMIN_ROLE, checkListings } from '$lib/server/housing';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	const result = await checkListings(body?.force === true);
	return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
};
