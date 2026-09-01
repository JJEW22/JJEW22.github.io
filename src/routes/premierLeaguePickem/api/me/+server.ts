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
    const picks = await sql`select fixture_id, pick, auto_penalty, fan_override from match_picks where user_id = ${locals.user.id}`;
    const matchPicks = Object.fromEntries(picks.map((p) => [p.fixture_id, p.pick]));
    // Picks an admin placed while keeping the no-pick penalty. The card needs these
    // to show the reduced base, or it would advertise points the player won't get.
    const penalizedPicks = picks.filter((p) => p.auto_penalty).map((p) => p.fixture_id);
    // Matches where an admin pinned the pick against the fan-team rule. Without these
    // the card would keep showing the club as auto-picked, contradicting the score.
    const fanOverrides = picks.filter((p) => p.fan_override).map((p) => p.fixture_id);
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
        penalizedPicks,
        fanOverrides,
        tableOrder: tp?.team_order ?? null,
        predictionsSaved: saved,
        predictionsLocked: saved && deadlinePassed(),
        deadline: PREDICTIONS_DEADLINE.toISOString(),
        tablesRevealed
    });
};