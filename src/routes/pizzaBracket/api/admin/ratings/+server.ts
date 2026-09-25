// src/routes/pizzaBracket/api/admin/ratings/+server.ts
// The grid's save. Takes only the cells that changed.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import {
	PIZZA_ADMIN_ROLE,
	badRequest,
	requireBracket,
	statePayload,
	stateResponse
} from '$lib/server/pizzaAdmin';
import type { RequestHandler } from './$types';

export const prerender = false;

interface Change {
	matchId: number;
	teamId: number;
	voterId: number;
	// Null clears the cell. An empty cell is not a zero — it means this person
	// didn't try that pizza, and the scoring depends on telling those apart.
	rating: number | null;
}

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, PIZZA_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const changes: unknown = body?.changes;
	if (!Array.isArray(changes)) return badRequest('Send { changes: [...] }.');
	if (!changes.length) return stateResponse();

	const bracket = await requireBracket();
	const matchesById = new Map(bracket.matches.map((m) => [m.id, m]));
	const voterIds = new Set(bracket.voters.map((v) => v.id));

	const clean: Change[] = [];
	for (const raw of changes) {
		const matchId = Number(raw?.matchId);
		const teamId = Number(raw?.teamId);
		const voterId = Number(raw?.voterId);
		const rating = raw?.rating === null || raw?.rating === undefined ? null : Number(raw.rating);

		const match = matchesById.get(matchId);
		if (!match) return badRequest(`Unknown match ${raw?.matchId}.`);
		if (!voterIds.has(voterId)) return badRequest(`Unknown voter ${raw?.voterId}.`);
		// A rating for a team that isn't in this matchup has nowhere to go, and
		// silently keeping it is how the old name-keyed pipeline lost votes.
		if (!match.slots.some((s) => s.teamId === teamId)) {
			return badRequest(`Team ${raw?.teamId} is not in match ${match.matchKey}.`);
		}
		if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
			return badRequest(`Rating ${raw?.rating} is outside 0-5.`);
		}

		clean.push({ matchId, teamId, voterId, rating });
	}

	await sql.begin(async (tx) => {
		for (const c of clean) {
			if (c.rating === null) {
				await tx`
					delete from pizza_ratings
					where match_id = ${c.matchId} and team_id = ${c.teamId} and voter_id = ${c.voterId}
				`;
			} else {
				await tx`
					insert into pizza_ratings (match_id, team_id, voter_id, rating)
					values (${c.matchId}, ${c.teamId}, ${c.voterId}, ${c.rating})
					on conflict (match_id, team_id, voter_id) do update
						set rating = excluded.rating, updated_at = now()
				`;
			}
		}
	});

	const saved = clean.filter((c) => c.rating !== null).length;
	return json({ ...(await statePayload()), saved, cleared: clean.length - saved });
};
