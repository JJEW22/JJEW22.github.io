// src/routes/premierLeaguePickem/api/admin/sync-results/+server.ts
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { sql } from '$lib/server/db';
import { getFinishedMatches } from '$lib/server/football';
import type { RequestHandler } from './$types';

// Populates `results` (winner + goals) from football-data. Goals let us derive
// the league table for any matchweek on demand, so nothing is snapshotted.
// Call on a schedule with ?key=<SYNC_SECRET>, or from the Admin tab.
export const POST: RequestHandler = async ({ url, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin');
    const matches = await getFinishedMatches();
    for (const m of matches) {
        await sql`insert into results (fixture_id, matchweek, winner, home_id, away_id, home_goals, away_goals)
                  values (${m.id}, ${m.matchweek}, ${m.winner}, ${m.homeId}, ${m.awayId}, ${m.homeGoals}, ${m.awayGoals})
                  on conflict (fixture_id) do update set
                    winner = excluded.winner,
                    matchweek = excluded.matchweek,
                    home_id = excluded.home_id,
                    away_id = excluded.away_id,
                    home_goals = excluded.home_goals,
                    away_goals = excluded.away_goals,
                    updated_at = now()`;
    }
    return json({ ok: true, synced: matches.length });
};