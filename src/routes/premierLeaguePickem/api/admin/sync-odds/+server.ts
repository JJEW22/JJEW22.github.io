// src/routes/premierLeaguePickem/api/admin/sync-odds/+server.ts
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { fetchOddsMultipliers } from '$lib/server/odds';
import { getUpcomingMatches } from '$lib/server/football';
import type { RequestHandler } from './$types';

// Captures probabilities + multipliers onto upcoming fixtures. Run on a schedule
// with ?key=<SYNC_SECRET>. Odds freeze at kickoff (started matches are skipped).
export const POST: RequestHandler = async ({ url }) => {
    if (!env.SYNC_SECRET || url.searchParams.get('key') !== env.SYNC_SECRET) {
        throw error(401, 'bad or missing key');
    }

    const [odds, fixtures] = await Promise.all([fetchOddsMultipliers(), getUpcomingMatches(45)]);

    const byPair = new Map<string, { id: string; matchweek: number; kickoff: string }>();
    for (const f of fixtures) byPair.set(`${f.homeId}|${f.awayId}`, f);

    const now = Date.now();
    let updated = 0;
    let unmatched = 0;
    let frozen = 0;

    for (const o of odds) {
        const f = byPair.get(`${o.homeId}|${o.awayId}`);
        if (!f) {
            unmatched++;
            continue;
        }
        if (new Date(f.kickoff).getTime() <= now) {
            frozen++;
            continue;
        }
        await sql`insert into results (fixture_id, matchweek, home_id, away_id, mult_home, mult_away, prob_home, prob_draw, prob_away)
                  values (${f.id}, ${f.matchweek}, ${o.homeId}, ${o.awayId}, ${o.multHome}, ${o.multAway}, ${o.probHome}, ${o.probDraw}, ${o.probAway})
                  on conflict (fixture_id) do update set
                    mult_home = excluded.mult_home,
                    mult_away = excluded.mult_away,
                    prob_home = excluded.prob_home,
                    prob_draw = excluded.prob_draw,
                    prob_away = excluded.prob_away,
                    home_id = excluded.home_id,
                    away_id = excluded.away_id`;
        updated++;
    }

    return json({ ok: true, updated, unmatched, frozen, oddsEvents: odds.length, fixtures: fixtures.length });
};