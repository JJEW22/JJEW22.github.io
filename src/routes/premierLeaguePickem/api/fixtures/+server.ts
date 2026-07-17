// src/routes/premierLeaguePickem/api/fixtures/+server.ts
import { json } from '@sveltejs/kit';
import { getFixtures } from '$lib/server/football';
import { pickBonusFixtures, computeTable } from '$lib/server/scoring';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const mw = Number(url.searchParams.get('mw')) || 1;
    const fixtures = await getFixtures(mw);

    const ids = fixtures.map((f) => f.id);
    const oddsRows = ids.length
        ? await sql<
              {
                  fixture_id: string;
                  mult_home: number;
                  mult_away: number;
                  prob_home: number | null;
                  prob_draw: number | null;
                  prob_away: number | null;
              }[]
          >`select fixture_id, mult_home, mult_away, prob_home, prob_draw, prob_away
            from results where fixture_id = any(${ids})`
        : [];
    const oddsById = new Map(oddsRows.map((r) => [r.fixture_id, r]));

    // Current standings, derived from all finished matches (for the interest fn).
    const finished = await sql<{ matchweek: number; home_id: string | null; away_id: string | null; home_goals: number | null; away_goals: number | null }[]>`
        select matchweek, home_id, away_id, home_goals, away_goals
        from results where home_goals is not null and away_goals is not null`;
    const positions = new Map(computeTable(finished).map((e) => [e.teamId, e.position]));

    // Golden/silver/bronze for this week, using the SAME picker the scorer uses,
    // so what players see while picking matches how it later scores.
    const { goldenId, silverId, bronzeId } = pickBonusFixtures(
        fixtures.map((f) => {
            const o = oddsById.get(f.id);
            return {
                id: f.id,
                homeId: f.homeId,
                awayId: f.awayId,
                probHome: o?.prob_home != null ? Number(o.prob_home) : null,
                probAway: o?.prob_away != null ? Number(o.prob_away) : null
            };
        }),
        mw,
        positions
    );

    return json({
        number: mw,
        fixtures: fixtures.map((f) => {
            const o = oddsById.get(f.id);
            return {
                id: f.id,
                homeId: f.homeId,
                awayId: f.awayId,
                homeName: f.homeName,
                awayName: f.awayName,
                kickoff: f.kickoff,
                multHome: o ? Number(o.mult_home) : 1,
                multAway: o ? Number(o.mult_away) : 1,
                probHome: o && o.prob_home != null ? Number(o.prob_home) : null,
                probDraw: o && o.prob_draw != null ? Number(o.prob_draw) : null,
                probAway: o && o.prob_away != null ? Number(o.prob_away) : null,
                bonus:
                    f.id === goldenId ? 'GOLDEN' : f.id === silverId ? 'SILVER' : f.id === bronzeId ? 'BRONZE' : null
            };
        })
    });
};