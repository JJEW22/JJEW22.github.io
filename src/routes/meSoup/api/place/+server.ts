// src/routes/meSoup/api/place/+server.ts
// POST { link } -> what a pasted Google Maps link says about a spot: its
// coordinates, and the name, country, region and water type where they can be
// worked out. Nothing is saved; the /meSoup/spots form fills its fields from the answer
// and the spot is saved the usual way.
//
// Signed in only, like /meSoup/api/mine: it calls out to Google's short
// links and to OpenStreetMap, and shouldn't be an open relay for either.
import { error, json } from '@sveltejs/kit';
import { MapsLinkError, lookUpMapsLink } from '$lib/server/mapsLink';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to look up a place.');

	const body = await request.json().catch(() => null);
	const link = typeof body?.link === 'string' ? body.link.trim() : '';
	if (!link) return json({ ok: false, error: 'Paste a Google Maps link first.' }, { status: 400 });
	if (link.length > 4000) {
		return json({ ok: false, error: 'That link is too long.' }, { status: 400 });
	}

	try {
		return json({ ok: true, place: await lookUpMapsLink(link) });
	} catch (err) {
		if (err instanceof MapsLinkError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
};
