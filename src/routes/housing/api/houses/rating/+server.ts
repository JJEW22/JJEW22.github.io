// src/routes/housing/api/houses/rating/+server.ts
// Rate a house: how the signed-in admin feels about it, 1 to 5.
//
//   POST { id, score, comment }   set your rating (score null removes it)
//
// A rating belongs to a person, so this needs a session; the SYNC_SECRET path
// that the other housing endpoints accept has no one to attribute it to.
import { requireAdmin } from '$lib/server/roles';
import { HOUSING_ADMIN_ROLE, HouseError, setRating } from '$lib/server/housing';
import { idOf, respond } from '../respond';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	const me = locals.user?.id ?? null;
	return respond(async () => {
		if (me === null) throw new HouseError('Sign in to rate a house.', 401);
		const score = body?.score === null || body?.score === undefined ? null : Number(body.score);
		const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
		await setRating(idOf(body), me, score, comment);
		return score === null ? 'Rating removed.' : 'Rating saved.';
	}, me);
};
