// src/routes/pizzaBracket/api/admin/voter/+server.ts
// Add, rename, or remove someone from the tasting panel.
//
// Voters are free text rather than site accounts: people rate pizza at a table and
// most of them have never logged in. New ones turn up every round, which under the
// xlsx meant editing column A and re-running the script.
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
	const action = body?.action;
	const bracket = await requireBracket();

	try {
		if (action === 'add') {
			const name = typeof body?.name === 'string' ? body.name.trim() : '';
			if (!name) return badRequest('A voter needs a name.');
			// Sorted after everyone already on the panel, so the grid's row order is
			// arrival order and nobody's row moves under them mid-entry.
			const nextOrder = bracket.voters.length;
			await sql`
				insert into pizza_voters (bracket_id, name, sort_order)
				values (${bracket.id}, ${name}, ${nextOrder})
			`;
		} else if (action === 'rename') {
			const voterId = Number(body?.voterId);
			const name = typeof body?.name === 'string' ? body.name.trim() : '';
			if (!name) return badRequest('A voter needs a name.');
			if (!bracket.voters.some((v) => v.id === voterId)) {
				return badRequest(`Unknown voter ${body?.voterId}.`);
			}
			await sql`update pizza_voters set name = ${name} where id = ${voterId}`;
		} else if (action === 'remove') {
			const voterId = Number(body?.voterId);
			if (!bracket.voters.some((v) => v.id === voterId)) {
				return badRequest(`Unknown voter ${body?.voterId}.`);
			}
			// pizza_ratings cascades, so this deletes their scores too — which can
			// change a winner. The page confirms first and says how many go with them.
			await sql`delete from pizza_voters where id = ${voterId}`;
		} else {
			return badRequest("action must be 'add', 'rename', or 'remove'.");
		}
	} catch (err) {
		if (isUniqueViolation(err)) {
			return json(
				{ ok: false, error: 'Someone on this panel already has that name.' },
				{ status: 409 }
			);
		}
		throw err;
	}

	return json(await statePayload());
};
