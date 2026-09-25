// src/routes/premierLeaguePickem/api/standings/+server.ts
import { json } from '@sveltejs/kit';
import { getStandings, type StandingRow } from '$lib/server/football';
import { getTeamPerformance } from '$lib/server/scoring';
import type { RequestHandler } from './$types';

interface StandingWithPerformance extends StandingRow {
    // Over/under performance against the odds. Null when the club has no
    // finished match with odds on record, which is every club until week 1 lands.
    performance: number | null;
    // Matches behind that figure. Can trail the league table's `played` when a
    // fixture completed without odds, so the two columns are allowed to disagree.
    performancePlayed: number;
}

export const GET: RequestHandler = async () => {
    const table = await getStandings();

    // Performance comes from our own results table; the league table doesn't need
    // it. If the database is unreachable that costs a column, not the tab — the
    // same trade getStandings already makes for the form guide.
    try {
        const perf = await getTeamPerformance();
        const rows: StandingWithPerformance[] = table.map((row) => {
            const p = perf.get(row.teamId);
            return {
                ...row,
                performance: p && p.played ? p.delta : null,
                performancePlayed: p?.played ?? 0
            };
        });
        return json(rows);
    } catch (err) {
        console.error('standings: performance unavailable, returning table without it', err);
        return json(table);
    }
};
