// src/lib/server/scoring.ts
import { sql } from '$lib/server/db';
import { TEAMS } from '$lib/plTeams';

// Fixed base for every match. Tune here.
export const BASE_POINTS = 25;

// Match bonuses (added to base). Gold/silver/bronze always apply to their
// designated match for everyone; the fan-team bonus applies to a player's
// fan-team match. When more than one would land on the same match they do NOT
// stack — the largest applies (see computeLeaderboard).
export const GOLDEN_BONUS = 10;
export const SILVER_BONUS = 5;
export const BRONZE_BONUS = 3;
export const FAN_BONUS = 5;

// Interest-function constants.
const REL_C = 5; // relative-position softening constant
const ABS_B = 3; // absolute-position offset

export interface BonusInput {
    id: string;
    homeId: string | null;
    awayId: string | null;
    probHome: number | null;
    probAway: number | null;
}

// "Most interesting match" ranking → golden (1st), silver (2nd), bronze (3rd).
// Weeks 1–5: closeness of the two win probabilities, (w1 + w2) / |w1 - w2|.
// Weeks 6+: that × relative-position × absolute-position, where
//   relative = (C + 1) / (C + |pos1 - pos2|)         (shrinks as teams separate)
//   absolute = max(40 - pos1 - pos2, pos1 + pos2 - B) (matters to top or bottom)
// `positions` maps teamId → current standings position (1 = top).
export function pickBonusFixtures(
    fixtures: BonusInput[],
    matchweek: number,
    positions: Map<string, number>
): { goldenId: string | null; silverId: string | null; bronzeId: string | null } {
    const scored = fixtures.map((f) => {
        const w1 = f.probHome ?? 0;
        const w2 = f.probAway ?? 0;
        const denom = Math.abs(w1 - w2);
        let probValue: number;
        if (denom === 0) probValue = w1 + w2 === 0 ? 0 : (w1 + w2) / 1e-9;
        else probValue = (w1 + w2) / denom;

        let interest = probValue;
        if (matchweek > 5) {
            const t1 = positions.get(f.homeId ?? '') ?? 20;
            const t2 = positions.get(f.awayId ?? '') ?? 20;
            const rel = (REL_C + 1) / (REL_C + Math.abs(t1 - t2));
            const abs = Math.max(40 - t1 - t2, t1 + t2 - ABS_B);
            interest = probValue * rel * abs;
        }
        return { id: f.id, interest };
    });
    scored.sort((a, b) => b.interest - a.interest);
    return {
        goldenId: scored[0]?.id ?? null,
        silverId: scored[1]?.id ?? null,
        bronzeId: scored[2]?.id ?? null
    };
}

// Map a bonus flag to its base-point value.
export function bonusPoints(flag: string | null): number {
    if (flag === 'GOLDEN') return GOLDEN_BONUS;
    if (flag === 'SILVER') return SILVER_BONUS;
    if (flag === 'BRONZE') return BRONZE_BONUS;
    return 0;
}

type Outcome = 'WIN' | 'TIE' | 'LOSS';

// Rule 3: win = 1, loss = 0, tie = 1/3 (or 1/2 when it's your fan team's game).
export function resultMultiplier(outcome: Outcome, isFanTeamGame: boolean): number {
    if (outcome === 'WIN') return 1;
    if (outcome === 'LOSS') return 0;
    return isFanTeamGame ? 1 / 2 : 1 / 3; // tie
}

// ---------- Table-prediction scoring: array generator ----------

// Deterministic gap-walk. Gap-vector for a matchweek: start [] (week 1); the
// "perfect" length-k vector is [k, k-1, ..., 1]; between perfects, raise gaps
// left-to-right one at a time, then append a 1.
export function gapVectorForWeek(week: number): number[] {
    const gaps: number[] = [];
    let w = 1;
    while (w < week) {
        const L = gaps.length;
        for (let i = 0; i < L && w < week; i++) {
            gaps[i] += 1;
            w++;
        }
        if (w < week) {
            gaps.push(1);
            w++;
        }
    }
    return gaps;
}

// Scoring array for a week: leading value == week, descending to 1.
export function arrayForWeek(week: number): number[] {
    if (week < 1) return [];
    const gaps = gapVectorForWeek(week);
    const n = gaps.length + 1;
    const arr = new Array<number>(n);
    arr[n - 1] = 1;
    for (let i = n - 2; i >= 0; i--) arr[i] = arr[i + 1] + gaps[i];
    return arr;
}

// Points for one team in one week: array[distance], or 0 beyond the array.
export function tableScoring(distance: number, week: number): number {
    const arr = arrayForWeek(week);
    return distance >= 0 && distance < arr.length ? arr[distance] : 0;
}

// ---------- Table derived from match data ----------

export interface MatchRow {
    matchweek: number;
    home_id: string | null;
    away_id: string | null;
    home_goals: number | null;
    away_goals: number | null;
}

export interface TableEntry {
    teamId: string;
    played: number;
    points: number;
    gd: number;
    gs: number;
    position: number;
}

// Compute the league table from a set of finished matches. All 20 teams are
// seeded so every team gets a position even with no games played. Ordering:
// points, then goal difference, then goals scored (then id, for determinism).
export function computeTable(matches: MatchRow[]): TableEntry[] {
    const t = new Map<string, { played: number; points: number; gf: number; ga: number }>();
    for (const team of TEAMS) t.set(team.id, { played: 0, points: 0, gf: 0, ga: 0 });

    for (const m of matches) {
        if (m.home_goals == null || m.away_goals == null || !m.home_id || !m.away_id) continue;
        const h = t.get(m.home_id);
        const a = t.get(m.away_id);
        if (!h || !a) continue;
        const hg = Number(m.home_goals);
        const ag = Number(m.away_goals);
        h.played++;
        a.played++;
        h.gf += hg;
        h.ga += ag;
        a.gf += ag;
        a.ga += hg;
        if (hg > ag) h.points += 3;
        else if (hg < ag) a.points += 3;
        else {
            h.points += 1;
            a.points += 1;
        }
    }

    const rows = [...t.entries()].map(([teamId, v]) => ({
        teamId,
        played: v.played,
        points: v.points,
        gd: v.gf - v.ga,
        gs: v.gf
    }));
    rows.sort(
        (x, y) => y.points - x.points || y.gd - x.gd || y.gs - x.gs || x.teamId.localeCompare(y.teamId)
    );
    return rows.map((e, i) => ({ ...e, position: i + 1 }));
}

// Band-overlap lock test for a given week's table. games-in-hand = week - played
// (one match per team per week). A team is provisional if its reachable-points
// band [pts, pts + 3*gih] overlaps or touches another team's band where at least
// one still has games in hand; locked otherwise.
export function lockedSet(table: TableEntry[], week: number): Map<string, boolean> {
    const bands = table.map((e) => {
        const gih = Math.max(0, week - e.played);
        return { teamId: e.teamId, pending: gih > 0, lo: e.points, hi: e.points + 3 * gih };
    });
    const locked = new Map<string, boolean>();
    for (const x of bands) {
        let provisional = false;
        for (const y of bands) {
            if (y === x) continue;
            if (!x.pending && !y.pending) continue;
            if (x.lo <= y.hi && y.lo <= x.hi) {
                provisional = true;
                break;
            }
        }
        locked.set(x.teamId, !provisional);
    }
    return locked;
}

// ---------- Leaderboard ----------

interface ResultRow {
    fixture_id: string;
    matchweek: number;
    winner: string | null;
    home_id: string | null;
    away_id: string | null;
    home_goals: number | null;
    away_goals: number | null;
    mult_home: number;
    mult_away: number;
    bonus: string | null;
}

export interface LeaderRow {
    player: string;
    matchPoints: number;
    tablePoints: number;
    lockedTablePoints: number;
    provisionalTablePoints: number;
    tableProvisional: boolean;
    total: number;
}

export async function computeLeaderboard(): Promise<LeaderRow[]> {
    const users = await sql<{ id: number; username: string; fan_team: string | null; predictions_saved_at: Date | null }[]>`
        select id, username, fan_team, predictions_saved_at from users`;
    const picks = await sql<{ user_id: number; fixture_id: string; pick: string }[]>`
        select user_id, fixture_id, pick from match_picks`;
    const results = await sql<ResultRow[]>`
        select fixture_id, matchweek, winner, home_id, away_id, home_goals, away_goals, mult_home, mult_away, bonus
        from results`;
    const preds = await sql<{ user_id: number; team_order: unknown }[]>`
        select user_id, team_order from table_predictions`;

    const picksByUser = new Map<number, Map<string, string>>();
    for (const p of picks) {
        let m = picksByUser.get(p.user_id);
        if (!m) {
            m = new Map();
            picksByUser.set(p.user_id, m);
        }
        m.set(p.fixture_id, p.pick);
    }

    const predByUser = new Map<number, string[]>();
    for (const p of preds) {
        const order = Array.isArray(p.team_order) ? (p.team_order as string[]) : JSON.parse(String(p.team_order));
        predByUser.set(p.user_id, order);
    }

    // Pre-derive each completed week's table + locked/provisional set from match data.
    const finished = results.filter((r) => r.home_goals != null && r.away_goals != null);
    const currentWeek = finished.reduce((mx, r) => Math.max(mx, r.matchweek), 0);
    const weekTables: { week: number; table: TableEntry[]; locked: Map<string, boolean> }[] = [];
    for (let W = 1; W <= currentWeek; W++) {
        const upto = finished.filter((r) => r.matchweek <= W);
        const table = computeTable(upto);
        weekTables.push({ week: W, table, locked: lockedSet(table, W) });
    }

    const board: LeaderRow[] = users.map((u) => {
        const myPicks = picksByUser.get(u.id) ?? new Map<string, string>();
        // Fan benefits (auto-pick, 1/2-tie, +5 base) and table points only count
        // once the player has committed their season predictions.
        const saved = u.predictions_saved_at != null;
        const fanActive = saved && u.fan_team ? u.fan_team : null;
        let matchPoints = 0;

        for (const r of results) {
            if (!r.winner) continue;

            let side: 'HOME' | 'AWAY' | null = null;
            let isFanTeamGame = false;
            if (fanActive && r.home_id === fanActive) {
                side = 'HOME';
                isFanTeamGame = true;
            } else if (fanActive && r.away_id === fanActive) {
                side = 'AWAY';
                isFanTeamGame = true;
            } else {
                const manual = myPicks.get(r.fixture_id);
                if (manual === 'HOME' || manual === 'AWAY') side = manual;
            }
            if (!side) continue;

            let outcome: Outcome;
            if (r.winner === 'DRAW') outcome = 'TIE';
            else if ((side === 'HOME' && r.winner === 'HOME_TEAM') || (side === 'AWAY' && r.winner === 'AWAY_TEAM'))
                outcome = 'WIN';
            else outcome = 'LOSS';

            // Effective base: gold/silver/bronze apply to their match for everyone;
            // the fan-team bonus applies to the fan's match. They STACK — e.g. a
            // fan team in the golden match gets base + 10 + 5.
            const matchBonus = bonusPoints(r.bonus);
            const fanBonus = !!fanActive && (r.home_id === fanActive || r.away_id === fanActive) ? FAN_BONUS : 0;
            const base = BASE_POINTS + matchBonus + fanBonus;

            const oddsMult = side === 'HOME' ? Number(r.mult_home) : Number(r.mult_away);
            matchPoints += base * oddsMult * resultMultiplier(outcome, isFanTeamGame);
        }

        // Table-prediction points, summed over every completed week (only if saved).
        let lockedTable = 0;
        let provTable = 0;
        const order = predByUser.get(u.id);
        if (saved && order && order.length) {
            const predPos = new Map<string, number>();
            order.forEach((tid, i) => predPos.set(tid, i + 1));
            for (const wt of weekTables) {
                for (const e of wt.table) {
                    const pp = predPos.get(e.teamId);
                    if (pp == null) continue;
                    const pts = tableScoring(Math.abs(e.position - pp), wt.week);
                    if (wt.locked.get(e.teamId)) lockedTable += pts;
                    else provTable += pts;
                }
            }
        }

        return {
            player: u.username,
            matchPoints: Math.round(matchPoints),
            tablePoints: lockedTable + provTable,
            lockedTablePoints: lockedTable,
            provisionalTablePoints: provTable,
            tableProvisional: provTable > 0,
            total: 0
        };
    });

    board.forEach((b) => (b.total = b.matchPoints + b.tablePoints));
    board.sort((a, b) => b.total - a.total);
    return board;
}