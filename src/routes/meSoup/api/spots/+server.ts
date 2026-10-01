// src/routes/meSoup/api/spots/+server.ts
// The list behind the map, and who gets which one:
//   signed out                  -> everyone's spots, anonymized (listAnonymousSpots)
//   signed in, ?view=everyone   -> the same anonymized list -- "everyone" means
//                                  the same thing whoever is asking
//   signed in, ?user=Name       -> Name's map as far as Name has let you see it:
//                                  all of it if shared, else Name's swims you're
//                                  tagged on (404 if neither)
//   signed in                   -> your spots plus the ones you've accepted a tag
//                                  on, in full
// Signed in, every answer also carries the tags waiting on you (the banner) and
// the people who've shared a swim with you (the view switcher).
import { json } from '@sveltejs/kit';
import {
	listAnonymousSpots,
	listPendingTags,
	listPersonSpots,
	listSharers,
	listWaterTypes,
	listVisibleSpots,
	listWaterTypesForViewer
} from '$lib/server/swimSpots';
import { WATER_TYPES } from '$lib/swimSpots';
import type { RequestHandler } from './$types';

export const prerender = false;

// Someone's own and shared spots must never sit in a shared cache, or be served
// back from the browser's after they sign out.
const PRIVATE = { 'cache-control': 'private, no-store', vary: 'cookie' };

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user;
	if (!user) {
		return json(
			{ ok: true, anonymous: true, spots: await listAnonymousSpots(), waterTypes: WATER_TYPES },
			{
				headers: {
					// Shared caching is fine for the anonymous map -- but only for
					// requests without a session, hence the Vary.
					'cache-control': 'public, max-age=60',
					vary: 'cookie'
				}
			}
		);
	}

	const [pending, sharers] = await Promise.all([listPendingTags(user.id), listSharers(user.id)]);
	const who = { me: user.username, pending, sharers };

	if (url.searchParams.get('view') === 'everyone') {
		return json(
			{
				ok: true,
				anonymous: true,
				...who,
				spots: await listAnonymousSpots(),
				waterTypes: WATER_TYPES
			},
			{ headers: PRIVATE }
		);
	}

	const person = url.searchParams.get('user')?.trim();
	if (person) {
		const view = await listPersonSpots(user.id, person);
		if (!view) {
			return json(
				{ ok: false, ...who, error: `${person} hasn't shared anything with you.` },
				{ status: 404, headers: PRIVATE }
			);
		}
		return json(
			{
				ok: true,
				anonymous: false,
				...who,
				person: view.owner,
				spots: view.spots,
				// Their custom types, so their dots keep their colors.
				waterTypes: await listWaterTypes(view.ownerId)
			},
			{ headers: PRIVATE }
		);
	}

	const [spots, waterTypes] = await Promise.all([
		listVisibleSpots(user.id),
		listWaterTypesForViewer(user.id)
	]);
	return json({ ok: true, anonymous: false, ...who, spots, waterTypes }, { headers: PRIVATE });
};
