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

    // Bonuses are only "established" from 2 weeks before the week is played, and
    // only once odds exist (otherwise ranking would be arbitrary). Future weeks
    // therefore show no gold/silver/bronze at all.
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
    const earliestKickoff = fixtures.reduce(
        (min, f) => Math.min(min, new Date(f.kickoff).getTime()),
        Infinity
    );
    const oddsExist = oddsRows.some((o) => o.prob_home != null || o.prob_away != null);
    const established = fixtures.length > 0 && oddsExist && earliestKickoff - Date.now() <= TWO_WEEKS_MS;

    const { goldenId, silverId, bronzeId } = established
        ? pickBonusFixtures(
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
          )
        : { goldenId: null, silverId: null, bronzeId: null };

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