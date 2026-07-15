// src/routes/premierLeaguePickem/api/fixtures/+server.ts
import { json } from '@sveltejs/kit';
import { getFixtures } from '$lib/server/football';
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
                probAway: o && o.prob_away != null ? Number(o.prob_away) : null
            };
        })
    });
};