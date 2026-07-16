// src/lib/server/scoring.ts
import { sql } from '$lib/server/db';

// Fixed base for every match. Tune here.
export const BASE_POINTS = 100;

type Outcome = 'WIN' | 'TIE' | 'LOSS';

// Rule 3: win = 1, loss = 0, tie = 1/3 (or 1/2 when it's your fan team's game).
export function resultMultiplier(outcome: Outcome, isFanTeamGame: boolean): number {
    if (outcome === 'WIN') return 1;
    if (outcome === 'LOSS') return 0;
    return isFanTeamGame ? 1 / 2 : 1 / 3; // tie
}

interface ResultRow {
    fixture_id: string;
    winner: string | null; // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW'
    home_id: string | null;
    away_id: string | null;
    mult_home: number; // odds multiplier for a home-side pick (1 until odds are wired)
    mult_away: number;
}

export interface LeaderRow {
    player: string;
    matchPoints: number;
    tablePoints: number;
    total: number;
}

export async function computeLeaderboard(): Promise<LeaderRow[]> {
    const users = await sql<{ id: number; username: string; fan_team: string | null }[]>`
        select id, username, fan_team from users`;
    const picks = await sql<{ user_id: number; fixture_id: string; pick: string }[]>`
        select user_id, fixture_id, pick from match_picks`;
    const results = await sql<ResultRow[]>`
        select fixture_id, winner, home_id, away_id, mult_home, mult_away
        from results where winner is not null`;

    // user_id -> (fixture_id -> pick)
    const picksByUser = new Map<number, Map<string, string>>();
    for (const p of picks) {
        let m = picksByUser.get(p.user_id);
        if (!m) {
            m = new Map();
            picksByUser.set(p.user_id, m);
        }
        m.set(p.fixture_id, p.pick);
    }

    const board: LeaderRow[] = users.map((u) => {
        const myPicks = picksByUser.get(u.id) ?? new Map<string, string>();
        let matchPoints = 0;

        for (const r of results) {
            if (!r.winner) continue;

            // Which side is this user backing on this match?
            let side: 'HOME' | 'AWAY' | null = null;
            let isFanTeamGame = false;

            if (u.fan_team && r.home_id === u.fan_team) {
                side = 'HOME'; // fan team is home -> auto-locked pick
                isFanTeamGame = true;
            } else if (u.fan_team && r.away_id === u.fan_team) {
                side = 'AWAY';
                isFanTeamGame = true;
            } else {
                const manual = myPicks.get(r.fixture_id);
                if (manual === 'HOME' || manual === 'AWAY') side = manual;
            }
            if (!side) continue; // no stake in this match -> no points

            let outcome: Outcome;
            if (r.winner === 'DRAW') outcome = 'TIE';
            else if (
                (side === 'HOME' && r.winner === 'HOME_TEAM') ||
                (side === 'AWAY' && r.winner === 'AWAY_TEAM')
            )
                outcome = 'WIN';
            else outcome = 'LOSS';

            const oddsMult = side === 'HOME' ? Number(r.mult_home) : Number(r.mult_away);
            matchPoints += BASE_POINTS * oddsMult * resultMultiplier(outcome, isFanTeamGame);
        }

        return { player: u.username, matchPoints: Math.round(matchPoints), tablePoints: 0, total: 0 };
    });

    board.forEach((b) => (b.total = b.matchPoints + b.tablePoints));
    board.sort((a, b) => b.total - a.total);
    return board;
}
