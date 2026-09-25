// src/routes/pizzaBracket/api/admin/match/+server.ts
// Overrule the ratings for one match.
//
// Needed for the two cases the arithmetic can't settle: a matchup nobody rated
// (A-R1-triple in the 2025 bracket), and a perfect tie on both votes and average,
// which the old script resolved by silently picking whichever team came first.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import { PIZZA_ADMIN_ROLE, badRequest, requireBracket, statePayload } from '$lib/server/pizzaAdmin';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, PIZZA_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const matchId = Number(body?.matchId);
	const hasWinner = body?.winnerTeamId !== null && body?.winnerTeamId !== undefined;
	const winnerTeamId = hasWinner ? Number(body.winnerTeamId) : null;
	const rawNote = typeof body?.note === 'string' ? body.note.trim() : '';
	const note = rawNote === '' ? null : rawNote;

	const bracket = await requireBracket();
	const match = bracket.matches.find((m) => m.id === matchId);
	if (!match) return badRequest(`Unknown match ${body?.matchId}.`);

	// Only someone actually standing in this match can win it.
	if (winnerTeamId !== null && !match.slots.some((s) => s.teamId === winnerTeamId)) {
		return badRequest(`Team ${body?.winnerTeamId} is not in match ${match.matchKey}.`);
	}

	await sql`
		update pizza_matches
		set winner_override_team_id = ${winnerTeamId}, override_note = ${note}
		where id = ${matchId}
	`;

	return json(await statePayload());
};
