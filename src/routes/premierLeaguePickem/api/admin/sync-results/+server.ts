// src/routes/premierLeaguePickem/api/admin/sync-results/+server.ts
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { getFinishedMatches } from '$lib/server/football';
import type { RequestHandler } from './$types';

// Populates the `results` table from football-data. Call on a schedule
// (a cron job or GitHub Action) with ?key=<SYNC_SECRET>.
// Note: mult_home / mult_away are left at their default (1) here; the future
// odds job is what fills those in.
export const POST: RequestHandler = async ({ url }) => {
    if (!env.SYNC_SECRET || url.searchParams.get('key') !== env.SYNC_SECRET) {
        throw error(401, 'bad or missing key');
    }
    const matches = await getFinishedMatches();
    for (const m of matches) {
        await sql`insert into results (fixture_id, matchweek, winner, home_id, away_id)
                  values (${m.id}, ${m.matchweek}, ${m.winner}, ${m.homeId}, ${m.awayId})
                  on conflict (fixture_id) do update set
                    winner = excluded.winner,
                    matchweek = excluded.matchweek,
                    home_id = excluded.home_id,
                    away_id = excluded.away_id,
                    updated_at = now()`;
    }
    return json({ ok: true, synced: matches.length });
};