// src/routes/pizzaBracket/api/admin/team/+server.ts
// Rename a pizzeria.
//
// Cheap now, and it wasn't before: ratings reference the team by id, so a rename
// is one row and everything follows it. Under the old name-keyed pipeline the same
// edit orphaned every rating the team had.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import {
	PIZZA_ADMIN_ROLE,
	badRequest,
	isUniqueViolation,
	requireBracket,
	statePayload
} from '$lib/server/pizzaAdmin';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, PIZZA_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const teamId = Number(body?.teamId);
	const name = typeof body?.name === 'string' ? body.name.trim() : '';

	if (!name) return badRequest('A team needs a name.');

	const bracket = await requireBracket();
	if (!bracket.teamsById.has(teamId)) return badRequest(`Unknown team ${body?.teamId}.`);

	try {
		await sql`update pizza_teams set name = ${name} where id = ${teamId}`;
	} catch (err) {
		if (isUniqueViolation(err)) {
			return json(
				{ ok: false, error: `Another team in this bracket is already called "${name}".` },
				{ status: 409 }
			);
		}
		throw err;
	}

	return json(await statePayload());
};
