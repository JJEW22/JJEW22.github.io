// src/routes/meSoup/api/tags/+server.ts
// Answer a tag: someone put you on their swim, and you accept (it joins your
// map, your name joins theirs) or decline (it doesn't, and it won't ask again).
// The pending list itself rides along with /meSoup/api/spots, which the page is
// loading anyway.
import { error, json } from '@sveltejs/kit';
import { listPendingTags, respondToTag } from '$lib/server/swimSpots';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to answer a tag.');

	const body = await request.json().catch(() => null);
	const spotId = Number(body?.spotId);
	if (!Number.isInteger(spotId) || spotId <= 0) {
		return json({ ok: false, error: `"${body?.spotId}" is not a spot id.` }, { status: 400 });
	}
	if (typeof body?.accept !== 'boolean') {
		return json({ ok: false, error: 'Say whether to accept: true or false.' }, { status: 400 });
	}

	if (!(await respondToTag(locals.user.id, spotId, body.accept))) {
		return json({ ok: false, error: 'That tag is no longer waiting on you.' }, { status: 404 });
	}
	return json(
		{ ok: true, pending: await listPendingTags(locals.user.id) },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
