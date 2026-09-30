// src/routes/meSoup/api/admin/spots/+server.ts
// Add, edit and remove swim spots. /meSoup/admin is prerendered like every other
// page here, so this is where the role is actually enforced -- the page only
// decides what to draw.
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import {
	SWIM_ADMIN_ROLE,
	createSpot,
	deleteSpot,
	listSpots,
	updateSpot
} from '$lib/server/swimSpots';
import { normalizeSpot } from '$lib/swimSpots';
import type { RequestHandler } from './$types';

export const prerender = false;

function badRequest(message: string): Response {
	return json({ ok: false, error: message }, { status: 400 });
}

// Every write replies with the whole list. There is no partial answer worth
// giving: an edited coordinate moves a dot and can change the country count, and
// the grid should never have to reconstruct that itself.
async function listPayload() {
	return json({ ok: true, spots: await listSpots() });
}

// The admin grid loads through here rather than the public route, so an admin
// who has lost the role finds out on load instead of on save.
export const GET: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, SWIM_ADMIN_ROLE, request.headers);
	return listPayload();
};

// One handler for create and edit: an `id` in the body means edit. The form is
// the same either way, so splitting it would only give the page a second path
// to get wrong.
export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, SWIM_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return badRequest('Expected a JSON body.');

	const result = normalizeSpot(body);
	if (!result.ok) return badRequest(result.error);

	if (body.id === undefined || body.id === null || body.id === '') {
		await createSpot(result.spot);
		return listPayload();
	}

	const id = Number(body.id);
	if (!Number.isInteger(id) || id <= 0) return badRequest(`"${body.id}" is not a spot id.`);

	const updated = await updateSpot(id, result.spot);
	if (!updated) return json({ ok: false, error: `No spot with id ${id}.` }, { status: 404 });
	return listPayload();
};

export const DELETE: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, SWIM_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const id = Number(body?.id);
	if (!Number.isInteger(id) || id <= 0) return badRequest(`"${body?.id}" is not a spot id.`);

	if (!(await deleteSpot(id))) {
		return json({ ok: false, error: `No spot with id ${id}.` }, { status: 404 });
	}
	return listPayload();
};
