// src/routes/housing/api/houses/lookup/+server.ts
// Look a house up on RentCast again: the "Update from RentCast" button.
//
//   POST { id, overwrite }   overwrite: replace price/beds/baths/sqft with
//                            RentCast's, rather than only filling empty ones
//
// Each call spends 3-4 of the month's 50 free RentCast requests.
import { requireAdmin } from '$lib/server/roles';
import { HOUSING_ADMIN_ROLE, refreshFromRentcast } from '$lib/server/housing';
import { idOf, respond } from '../respond';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	return respond(
		async () => refreshFromRentcast(idOf(body), body?.overwrite === true),
		locals.user?.id ?? null
	);
};
