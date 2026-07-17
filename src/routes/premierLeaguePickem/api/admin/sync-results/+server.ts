// src/routes/premierLeaguePickem/api/admin/sync-results/+server.ts
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { sql } from '$lib/server/db';
import { getFinishedMatches, getFixtures } from '$lib/server/football';
import { pickBonusFixtures, computeTable } from '$lib/server/scoring';
import type { RequestHandler } from './$types';

// Populates `results` (winner + goals) from football-data, and designates the
// current week's golden/silver/bronze bonus matches via the interest function.
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

    // Designate golden/silver/bronze for the furthest-along week.
    const currentWeek = matches.reduce((mx, m) => Math.max(mx, m.matchweek), 0);
    let golden: string | null = null;
    let silver: string | null = null;
    let bronze: string | null = null;
    if (currentWeek >= 1) {
        const fixtures = await getFixtures(currentWeek);
        const ids = fixtures.map((f) => f.id);
        const oddsRows = ids.length
            ? await sql<{ fixture_id: string; prob_home: number | null; prob_away: number | null }[]>`
                select fixture_id, prob_home, prob_away from results where fixture_id = any(${ids})`
            : [];
        const oddsById = new Map(oddsRows.map((r) => [r.fixture_id, r]));

        // Current standings, derived from all finished matches.
        const finished = await sql<{ matchweek: number; home_id: string | null; away_id: string | null; home_goals: number | null; away_goals: number | null }[]>`
            select matchweek, home_id, away_id, home_goals, away_goals
            from results where home_goals is not null and away_goals is not null`;
        const positions = new Map(computeTable(finished).map((e) => [e.teamId, e.position]));

        const inputs = fixtures.map((f) => {
            const o = oddsById.get(f.id);
            return {
                id: f.id,
                homeId: f.homeId,
                awayId: f.awayId,
                probHome: o?.prob_home != null ? Number(o.prob_home) : null,
                probAway: o?.prob_away != null ? Number(o.prob_away) : null
            };
        });
        ({ goldenId: golden, silverId: silver, bronzeId: bronze } = pickBonusFixtures(inputs, currentWeek, positions));

        await sql`update results set bonus = null where matchweek = ${currentWeek}`;
        if (golden) await sql`update results set bonus = 'GOLDEN' where fixture_id = ${golden}`;
        if (silver) await sql`update results set bonus = 'SILVER' where fixture_id = ${silver}`;
        if (bronze) await sql`update results set bonus = 'BRONZE' where fixture_id = ${bronze}`;
    }

    return json({ ok: true, synced: matches.length, week: currentWeek, golden, silver, bronze });
};