// src/routes/premierLeaguePickem/api/me/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { getFlag, REVEAL_TABLES_KEY } from '$lib/server/appMeta';
import { PREDICTIONS_DEADLINE, deadlinePassed } from '$lib/season';
import type { RequestHandler } from './$types';

// Restores the logged-in user, membership, fan team, saved picks, display name,
// and season-prediction lock state on load.
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ user: null });
    const me = (await sql`select fan_team, predictions_saved_at, pickem_joined_at, display_name
                          from users where id = ${locals.user.id}`)[0];
    const picks = await sql`select fixture_id, pick from match_picks where user_id = ${locals.user.id}`;
    const matchPicks = Object.fromEntries(picks.map((p) => [p.fixture_id, p.pick]));
    const tp = (await sql`select team_order from table_predictions where user_id = ${locals.user.id}`)[0];
    const tablesRevealed = await getFlag(REVEAL_TABLES_KEY);

    const saved = me?.predictions_saved_at != null;
    return json({
        user: locals.user.username,
        // The client needs this to work out its own coinPick() for locked matches
        // it never picked — the same input the server scores with.
        userId: locals.user.id,
        roles: locals.user.roles,
        joined: me?.pickem_joined_at != null,
        displayName: me?.display_name ?? null,
        fanTeam: me?.fan_team ?? null,
        matchPicks,
        tableOrder: tp?.team_order ?? null,
        predictionsSaved: saved,
        predictionsLocked: saved && deadlinePassed(),
        deadline: PREDICTIONS_DEADLINE.toISOString(),
        tablesRevealed
    });
};