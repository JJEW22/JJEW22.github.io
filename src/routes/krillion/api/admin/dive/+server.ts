// src/routes/krillion/api/admin/dive/+server.ts
// An admin entering or fixing a player's dive on their behalf -- past the
// 12:15am submission deadline too. The same checks as a player's own dive
// apply (answers on the day's list, or sent as overrides) and it's rescored
// straight away; the dive records which admin changed it. krillion:admin (or
// site:admin) only, and an open dive only once the admin has submitted their
// own.
//   GET                                       players who've submitted before
//   POST { dayNumber, submissionId | player, answers: [{ answer, override }] x7,
//          gameScore? }
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import {
	KRILLION_ADMIN_ROLE,
	KrillionError,
	adminSaveDive,
	krillionPlayers
} from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };

function gate(locals: App.Locals): Response | null {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	if (!hasRole(locals.user, KRILLION_ADMIN_ROLE)) {
		return json({ ok: false, error: 'This page needs the krillion:admin role.' }, { status: 403 });
	}
	return null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = gate(locals);
	if (denied) return denied;
	return json({ ok: true, players: await krillionPlayers() }, { headers: NO_STORE });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = gate(locals);
	if (denied) return denied;
	const body = await request.json().catch(() => null);
	const dayNumber = Number(body?.dayNumber);
	if (!body || !Number.isInteger(dayNumber) || dayNumber <= 0) {
		return json(
			{ ok: false, error: 'Send { dayNumber, submissionId | player, answers }.' },
			{ status: 400 }
		);
	}
	const submissionId = Number(body.submissionId);
	try {
		const saved = await adminSaveDive(locals.user!.id, {
			dayNumber,
			submissionId: Number.isInteger(submissionId) && submissionId > 0 ? submissionId : null,
			player: typeof body.player === 'string' ? body.player : null,
			answers: Array.isArray(body.answers) ? body.answers : [],
			gameScore: typeof body.gameScore === 'number' ? body.gameScore : null
		});
		return json({ ok: true, ...saved }, { headers: NO_STORE });
	} catch (err) {
		if (err instanceof KrillionError) {
			return json({ ok: false, error: err.message, ...err.details }, { status: err.status });
		}
		throw err;
	}
};
