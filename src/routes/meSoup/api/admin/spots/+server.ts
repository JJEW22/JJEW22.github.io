// src/routes/meSoup/api/admin/spots/+server.ts
// Add, edit and remove YOUR swim spots. Anyone signed in may keep a map, and
// every query below is scoped to the signed-in user, so nobody can touch
// anyone else's. /meSoup/admin is prerendered like every other page here, so
// this is where that is actually enforced -- the page only decides what to draw.
import { error, json } from '@sveltejs/kit';
import {
	createSpot,
	deleteSpot,
	ensureWaterType,
	listSpots,
	listWaterTypes,
	updateSpot
} from '$lib/server/swimSpots';
import { DEFAULT_WATER_TYPE, normalizeSpot } from '$lib/swimSpots';
import type { SessionUser } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const prerender = false;

function badRequest(message: string): Response {
	return json({ ok: false, error: message }, { status: 400 });
}

function requireUser(user: SessionUser | null): number {
	if (!user) throw error(401, 'Sign in to keep a map of your swims.');
	return user.id;
}

// Every write replies with the whole list. There is no partial answer worth
// giving: an edited coordinate moves a dot and can change the country count, and
// the grid should never have to reconstruct that itself. The water types ride
// along, so a type added by this save is in the dropdown straight away.
async function listPayload(userId: number) {
	const [spots, waterTypes] = await Promise.all([listSpots(userId), listWaterTypes(userId)]);
	return json({ ok: true, spots, waterTypes });
}

export const GET: RequestHandler = async ({ locals }) => {
	return listPayload(requireUser(locals.user));
};

// One handler for create and edit: an `id` in the body means edit. The form is
// the same either way, so splitting it would only give the page a second path
// to get wrong.
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = requireUser(locals.user);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return badRequest('Expected a JSON body.');

	const result = normalizeSpot(body, await listWaterTypes(userId));
	if (!result.ok) return badRequest(result.error);

	// "Other" with something typed beside it: that text becomes a type of its
	// own, kept for every spot after this one. Only once the rest of the spot
	// has passed, so a rejected save can't leave a stray type behind.
	const otherLabel = typeof body.otherLabel === 'string' ? body.otherLabel.trim() : '';
	if (result.spot.waterType === DEFAULT_WATER_TYPE && otherLabel) {
		if (otherLabel.length > 40) return badRequest('Keep the water type under 40 characters.');
		const id = await ensureWaterType(userId, otherLabel);
		if (!id) return badRequest(`"${otherLabel}" needs a letter or number in it.`);
		result.spot.waterType = id;
	}

	if (body.id === undefined || body.id === null || body.id === '') {
		await createSpot(userId, result.spot);
		return listPayload(userId);
	}

	const id = Number(body.id);
	if (!Number.isInteger(id) || id <= 0) return badRequest(`"${body.id}" is not a spot id.`);

	const updated = await updateSpot(userId, id, result.spot);
	if (!updated) return json({ ok: false, error: `No spot with id ${id}.` }, { status: 404 });
	return listPayload(userId);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const userId = requireUser(locals.user);

	const body = await request.json().catch(() => null);
	const id = Number(body?.id);
	if (!Number.isInteger(id) || id <= 0) return badRequest(`"${body?.id}" is not a spot id.`);

	if (!(await deleteSpot(userId, id))) {
		return json({ ok: false, error: `No spot with id ${id}.` }, { status: 404 });
	}
	return listPayload(userId);
};
