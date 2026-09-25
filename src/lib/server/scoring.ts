// src/lib/server/scoring.ts
import { sql } from '$lib/server/db';
import { getSeasonMatches } from '$lib/server/football';
import { TEAMS } from '$lib/plTeams';
import {
    FAN_BONUS,
    bonusPoints,
    coinPick,
    effectiveBasePoints,
    tableScoring,
    round1,
    ceil1
} from '$lib/pickemScoring';

// Point values and the two scoring formulas live in $lib/pickemScoring so the
// rules tab renders the same numbers this file scores with.

// Interest-function constants.
const REL_C = 5; // relative-position softening constant
const ABS_B = 3; // absolute-position offset
// Smallest odds gap the closeness term will divide by. Two sides priced almost
// identically would otherwise produce an unbounded score and win Golden outright,
// no matter what the table says. Also removes the divide-by-zero case.
const ODDS_GAP_FLOOR = 0.005;

export interface BonusInput {
    id: string;
    homeId: string | null;
    awayId: string | null;
    probHome: number | null;
    probAway: number | null;
}

// "Most interesting match" ranking → golden (1st), silver (2nd), bronze (3rd).
// Weeks 1–5: closeness of the two win probabilities, (w1 + w2) / sqrt(|w1 - w2|),
//   the gap floored at ODDS_GAP_FLOOR. The square root is deliberate: dividing by
//   the raw gap made closeness swamp everything else (~92% of the spread between
//   fixtures); the root brings it to roughly 40%, leaving room for the table terms.
// Weeks 6+: that × relative-position × absolute-position, where
//   relative = (C + 1) / (C + |pos1 - pos2|)           (shrinks as teams separate)
//   absolute = max(40 - pos1 - pos2, pos1 + pos2 - B)² (matters to top or bottom;
//              squared so a title race or relegation six-pointer carries real weight)
// `positions` maps teamId → current standings position (1 = top).
export function pickBonusFixtures(
    fixtures: BonusInput[],
    matchweek: number,
    positions: Map<string, number>
): { goldenId: string | null; silverId: string | null; bronzeId: string | null } {
    const scored = fixtures.map((f) => {
        const w1 = f.probHome ?? 0;
        const w2 = f.probAway ?? 0;
        // No odds yet (both zero) falls out as 0 without a special case.
        const gap = Math.max(Math.abs(w1 - w2), ODDS_GAP_FLOOR);
        const probValue = (w1 + w2) / Math.sqrt(gap);

        let interest = probValue;
        if (matchweek > 5) {
            const t1 = positions.get(f.homeId ?? '') ?? 20;
            const t2 = positions.get(f.awayId ?? '') ?? 20;
            const rel = (REL_C + 1) / (REL_C + Math.abs(t1 - t2));
            const abs = Math.max(40 - t1 - t2, t1 + t2 - ABS_B) ** 2;
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

type Outcome = 'WIN' | 'TIE' | 'LOSS';

// Rule 3: win = 1, loss = 0, tie = 1/3 (or 1/2 when it's your fan team's game).
export function resultMultiplier(outcome: Outcome, isFanTeamGame: boolean): number {
    if (outcome === 'WIN') return 1;
    if (outcome === 'LOSS') return 0;
    return isFanTeamGame ? 1 / 2 : 1 / 3; // tie
}

// ---------- Club performance against the odds ----------

export interface TeamPerformance {
    played: number; // finished matches that had real odds
    delta: number; // + is above the odds, - is below, 0 is exactly to them
}

// A fixture that never got odds is stored with both multipliers at 1 (the same
// sentinel the favourite/underdog split keys off). Counting it would add a match
// to the denominator whose expectation isn't 1, so it is skipped entirely.
function hasOdds(multHome: number, multAway: number): boolean {
    return (
        Number.isFinite(multHome) &&
        Number.isFinite(multAway) &&
        multHome > 0 &&
        multAway > 0 &&
        !(multHome === 1 && multAway === 1)
    );
}

/**
 * How far each club is running above or below what the bookmakers priced it at.
 *
 * Per match a club earns `mult x resultMultiplier`, where the multiplier is
 * 1 / (P_win + 0.5 * P_draw) (see server/odds.ts) and a draw scores 0.5 — the
 * fan-team tie-break. Those two are reciprocals by construction, so the expected
 * value of the product is exactly 1 per match. Sum them, subtract the matches
 * played, and 0 means a club has performed precisely to its odds.
 *
 * Equivalently: what you would have banked backing this club every week as your
 * fan team, over (BASE_POINTS + FAN_BONUS), less the games played.
 *
 * Gold/silver/bronze are deliberately NOT included. They are awarded on how
 * interesting a fixture looked, not on how a club played, so counting them would
 * move a club for having been featured — worth up to +1.8 over the first five
 * matchweeks, enough to reorder the middle of the table.
 */
export async function getTeamPerformance(): Promise<Map<string, TeamPerformance>> {
    const rows = await sql<
        {
            home_id: string | null;
            away_id: string | null;
            winner: string | null;
            mult_home: number;
            mult_away: number;
        }[]
    >`select home_id, away_id, winner, mult_home, mult_away
      from results
      where winner is not null and home_id is not null and away_id is not null`;

    const out = new Map<string, TeamPerformance>();
    const entry = (teamId: string) => {
        let e = out.get(teamId);
        if (!e) out.set(teamId, (e = { played: 0, delta: 0 }));
        return e;
    };

    for (const r of rows) {
        const multHome = Number(r.mult_home);
        const multAway = Number(r.mult_away);
        if (!hasOdds(multHome, multAway)) continue;

        for (const side of ['HOME', 'AWAY'] as const) {
            const teamId = side === 'HOME' ? r.home_id! : r.away_id!;
            const outcome: Outcome =
                r.winner === 'DRAW'
                    ? 'TIE'
                    : (side === 'HOME' && r.winner === 'HOME_TEAM') ||
                        (side === 'AWAY' && r.winner === 'AWAY_TEAM')
                      ? 'WIN'
                      : 'LOSS';

            const e = entry(teamId);
            e.played++;
            // isFanTeamGame is always true here: the metric asks what this club
            // would have paid the supporter who backed it every week.
            e.delta += (side === 'HOME' ? multHome : multAway) * resultMultiplier(outcome, true);
        }
    }

    // Two decimals: this is a derived stat, not an awarded score, so the
    // round-up-to-a-tenth rule for match points doesn't apply — and with 20 clubs
    // packed close together the extra digit is what separates them.
    for (const e of out.values()) e.delta = Math.round((e.delta - e.played) * 100) / 100;
    return out;
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

// ---------- Which matchweeks are over ----------

// A fixture that has left its round rather than being played. POSTPONED and
// SUSPENDED can sit for months before a new date is found, and the week they
// belong to must not stay unscored all that time.
const MOVED_OUT = new Set(['POSTPONED', 'SUSPENDED', 'CANCELLED']);

export interface WeekMatch {
    matchweek: number;
    kickoff: string;
    status: string;
    played: boolean;
}

// The matchweeks that are settled: every match in them has either been played or
// moved out of the round. "Moved out" is the rescheduling case — a fixture called
// off, or re-dated to after the NEXT round has already begun, no longer belongs
// to its week in any practical sense, so it doesn't hold the week open.
//
// Anything still scheduled inside its own round does hold it open, which is what
// keeps a Saturday half-played out of the settled column. Future weeks are never
// complete: their matches are all scheduled before the following round starts.
export function completedWeeks(matches: WeekMatch[]): Set<number> {
    const byWeek = new Map<number, WeekMatch[]>();
    for (const m of matches) {
        if (!Number.isFinite(m.matchweek)) continue;
        const list = byWeek.get(m.matchweek);
        if (list) list.push(m);
        else byWeek.set(m.matchweek, [m]);
    }

    // When each round begins. A fixture pushed past the start of the next round
    // has been rescheduled out of its own.
    const startOf = new Map<number, number>();
    for (const [w, list] of byWeek) {
        const times = list.map((m) => new Date(m.kickoff).getTime()).filter((t) => Number.isFinite(t));
        if (times.length) startOf.set(w, Math.min(...times));
    }

    const done = new Set<number>();
    for (const [w, list] of byWeek) {
        // No following round (the last week) means nothing counts as moved out by
        // date — only an explicit postponement lets that week close.
        const nextStart = startOf.get(w + 1) ?? Infinity;
        const blocking = list.some((m) => {
            if (m.played || MOVED_OUT.has(m.status)) return false;
            const at = new Date(m.kickoff).getTime();
            return !Number.isFinite(at) || at < nextStart;
        });
        if (!blocking) done.add(w);
    }
    return done;
}

const SEASON_WEEKS = 38;

// The first week that isn't over — the round being played, or the next one up if
// the last one has just finished. Zero once every week is settled: there is
// nothing left to preview.
function firstOpenWeek(done: Set<number>): number {
    for (let W = 1; W <= SEASON_WEEKS; W++) if (!done.has(W)) return W;
    return 0;
}

// How long after kickoff a match is certainly over — the same figure the results
// sync waits before pulling scores (RESYNC_AFTER_MS in sync.ts).
const MATCH_OVER_AFTER_MS = 135 * 60 * 1000;
// A finished week stays on screen this long before the picks tab moves everyone on
// to the next one, so the weekend's results are still what you land on afterwards.
const WEEK_ROLLOVER_MS = 24 * 60 * 60 * 1000;

// Which matchweek the picks tab opens on: the one being played, and for a day after
// it ends, then the next. Distinct from firstOpenWeek(), which flips the moment a
// week completes — here the just-finished week deliberately lingers.
export function defaultMatchweek(matches: WeekMatch[], now: number = Date.now()): number {
    const done = completedWeeks(matches);

    // When each week's last PLAYED match kicked off. Unplayed fixtures are excluded
    // deliberately: one postponed to December must not hold August's week on screen,
    // and completedWeeks() has already ruled that it doesn't hold the week open.
    const lastPlayed = new Map<number, number>();
    for (const m of matches) {
        if (!Number.isFinite(m.matchweek) || !m.played) continue;
        const at = new Date(m.kickoff).getTime();
        if (!Number.isFinite(at)) continue;
        const cur = lastPlayed.get(m.matchweek);
        if (cur == null || at > cur) lastPlayed.set(m.matchweek, at);
    }

    for (let W = 1; W <= SEASON_WEEKS; W++) {
        // Still being played, or yet to kick off at all: that's the one to show.
        if (!done.has(W)) return W;
        const last = lastPlayed.get(W);
        // Closed with nothing actually played (everything called off) — there are no
        // results to linger on, so move straight past it.
        if (last == null) continue;
        if (now < last + MATCH_OVER_AFTER_MS + WEEK_ROLLOVER_MS) return W;
    }
    // Season over and aged out; the last week is the only sensible thing left.
    return SEASON_WEEKS;
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
    fanTeam: string | null; // null until the player has saved their season predictions
    correctPicks: number; // outright winners called correctly; draws don't count
    // The slice of matchPoints that came from matches ending level. A stat, not a
    // pool of its own — it is ALREADY inside matchPoints, so never add it to total.
    drawPoints: number;
    // Where your match points came from, by who you backed. Also slices of
    // matchPoints, not additions to it. Draws count into these the same as wins.
    // topDog + underDog + myDog == matchPoints, except for a fixture that never got
    // odds (mult 1 on both sides, so it has no favourite and lands in none of them).
    topDogPoints: number; // backed the shorter price, fan team's games excluded
    underDogPoints: number; // backed the longer price, fan team's games excluded
    myDogPoints: number; // your fan team's games, which you never chose
    matchPoints: number;
    tablePoints: number;
    lockedTablePoints: number;
    provisionalTablePoints: number;
    tableProvisional: boolean;
    // What the LIVE week would pay if it ended with the standings exactly as they
    // are now. That week is still being played (or hasn't kicked off yet), so it
    // is not part of tablePoints and must never be added to total — it's a preview
    // of the next award, and it moves with every result.
    currentTablePoints: number;
    // Uniform across rows; carried here so the flat array response keeps its shape.
    tableWeek: number; // last matchweek that is over, i.e. what tablePoints covers
    liveWeek: number; // the week currentTablePoints previews; 0 before a ball is kicked
    total: number;
}

export async function computeLeaderboard(): Promise<LeaderRow[]> {
    const users = await sql<{ id: number; username: string; display_name: string | null; fan_team: string | null; predictions_saved_at: Date | null }[]>`
        select id, username, display_name, fan_team, predictions_saved_at
        from users where pickem_joined_at is not null`;
    const picks = await sql<{ user_id: number; fixture_id: string; pick: string; auto_penalty: boolean; fan_override: boolean }[]>`
        select user_id, fixture_id, pick, auto_penalty, fan_override from match_picks`;
    const results = await sql<ResultRow[]>`
        select fixture_id, matchweek, winner, home_id, away_id, home_goals, away_goals, mult_home, mult_away, bonus
        from results`;
    const preds = await sql<{ user_id: number; team_order: unknown }[]>`
        select user_id, team_order from table_predictions`;

    // `autoPenalty` is an admin override: the player is on this side, but the match
    // still scores at the no-pick rate. A normal pick has it false.
    // `fanOverride` is the other admin flag: use this pick even in the fan team's own
    // match, which normally outranks anything stored. See sql/014_fan_override.sql.
    const picksByUser = new Map<
        number,
        Map<string, { pick: string; autoPenalty: boolean; fanOverride: boolean }>
    >();
    for (const p of picks) {
        let m = picksByUser.get(p.user_id);
        if (!m) {
            m = new Map();
            picksByUser.set(p.user_id, m);
        }
        m.set(p.fixture_id, {
            pick: p.pick,
            autoPenalty: !!p.auto_penalty,
            fanOverride: !!p.fan_override
        });
    }

    const predByUser = new Map<number, string[]>();
    for (const p of preds) {
        const order = Array.isArray(p.team_order) ? (p.team_order as string[]) : JSON.parse(String(p.team_order));
        predByUser.set(p.user_id, order);
    }

    // Pre-derive each SETTLED week's table + locked/provisional set from match data.
    // Only weeks that are actually over pay out; the week being played is previewed
    // separately, in currentTablePoints.
    const finished = results.filter((r) => r.home_goals != null && r.away_goals != null);
    const newestPlayedWeek = finished.reduce((mx, r) => Math.max(mx, r.matchweek), 0);
    const playedWeeks = new Set(finished.map((r) => r.matchweek));

    // The schedule is what tells a finished week from one still being played. A
    // football-data outage must not 500 the leaderboard, so fall back to treating
    // the newest week with a result as live and everything before it as settled —
    // right except in the gap between rounds.
    let done: Set<number>;
    try {
        done = completedWeeks(await getSeasonMatches());
    } catch (err) {
        console.error('leaderboard: schedule unavailable, assuming the newest week with a result is live', err);
        done = new Set();
        for (let W = 1; W < newestPlayedWeek; W++) done.add(W);
    }

    // A week no football was played in awards nothing, and counting one would hand
    // out a free week's worth of points for a table that never moved.
    const settled = [...done].filter((w) => playedWeeks.has(w)).sort((a, b) => a - b);
    const tableWeek = settled.length ? settled[settled.length - 1] : 0;

    const weekTables: { week: number; table: TableEntry[]; locked: Map<string, boolean> }[] = [];
    for (const W of settled) {
        const upto = finished.filter((r) => r.matchweek <= W);
        const table = computeTable(upto);
        weekTables.push({ week: W, table, locked: lockedSet(table, W) });
    }

    // The live week, scored against the standings exactly as they are right now —
    // every match played so far, including one postponed out of an earlier week.
    // Nothing in it has been awarded; it is what that week pays if it ends here.
    // No locked/provisional split here: the whole figure is an estimate of a week
    // that hasn't finished, so marking part of it as unsettled would say nothing.
    const liveWeek = finished.length ? firstOpenWeek(done) : 0;
    const liveTable = liveWeek ? computeTable(finished) : [];

    const board: LeaderRow[] = users.map((u) => {
        const myPicks =
            picksByUser.get(u.id) ??
            new Map<string, { pick: string; autoPenalty: boolean; fanOverride: boolean }>();
        // Fan benefits (auto-pick, 1/2-tie, +5 base) and table points only count
        // once the player has committed their season predictions.
        const saved = u.predictions_saved_at != null;
        const fanActive = saved && u.fan_team ? u.fan_team : null;
        let matchPoints = 0;
        let correctPicks = 0;
        let drawPoints = 0;
        let topDogPoints = 0;
        let underDogPoints = 0;
        let myDogPoints = 0;

        for (const r of results) {
            if (!r.winner) continue;

            const stored = myPicks.get(r.fixture_id);
            const storedSide =
                stored && (stored.pick === 'HOME' || stored.pick === 'AWAY') ? stored.pick : null;
            const fanIsHome = !!fanActive && r.home_id === fanActive;
            const fanIsAway = !!fanActive && r.away_id === fanActive;

            // Precedence: admin fan-override > fan team > stored pick > coin.
            let side: 'HOME' | 'AWAY' | null = null;
            let autoPicked = false;
            if (storedSide && stored!.fanOverride) {
                // The one thing that outranks the fan team, and only because an admin
                // said so for this fixture by hand. See the override endpoint.
                side = storedSide;
                autoPicked = stored!.autoPenalty;
            } else if (fanIsHome) {
                side = 'HOME';
            } else if (fanIsAway) {
                side = 'AWAY';
            } else if (storedSide) {
                side = storedSide;
                // An admin can place someone on a side and keep the penalty.
                autoPicked = stored!.autoPenalty;
            } else {
                // No pick, and this match is finished — so it locked long ago.
                // The coin decides, at a reduced weight. Nothing to look up:
                // reaching this branch at all means the lock has passed.
                side = coinPick(u.id, r.fixture_id);
                autoPicked = true;
            }
            if (!side) continue;

            // The fan tie-break (1/2 rather than 1/3) rewards backing your own club,
            // so it follows the side actually held: an override onto the opposing side
            // gives it up. The fan BONUS below belongs to the fixture, not the side, so
            // it is unchanged either way — which is how it has always been paid.
            const isFanTeamGame = (side === 'HOME' && fanIsHome) || (side === 'AWAY' && fanIsAway);

            let outcome: Outcome;
            if (r.winner === 'DRAW') outcome = 'TIE';
            else if ((side === 'HOME' && r.winner === 'HOME_TEAM') || (side === 'AWAY' && r.winner === 'AWAY_TEAM'))
                outcome = 'WIN';
            else outcome = 'LOSS';
            if (outcome === 'WIN') correctPicks++;

            // Effective base: gold/silver/bronze apply to their match for everyone;
            // the fan-team bonus applies to the fan's match. They STACK — e.g. a
            // fan team in the golden match gets base + GOLDEN_BONUS + FAN_BONUS.
            const matchBonus = bonusPoints(r.bonus);
            const fanBonus = !!fanActive && (r.home_id === fanActive || r.away_id === fanActive) ? FAN_BONUS : 0;
            const base = effectiveBasePoints(matchBonus, fanBonus, autoPicked);

            // Rounded up to the next tenth per match, so a single fixture never
            // contributes a score finer than 0.1 (and neither can the total).
            const multHome = Number(r.mult_home);
            const multAway = Number(r.mult_away);
            const oddsMult = side === 'HOME' ? multHome : multAway;
            const awarded = ceil1(base * oddsMult * resultMultiplier(outcome, isFanTeamGame));
            matchPoints += awarded;
            // Split out for the leaderboard's draw column. Counted here rather than
            // re-derived later so it uses the same rounded figure the total does.
            if (outcome === 'TIE') drawPoints += awarded;

            // Favourite/underdog split, by the frozen odds — the shorter multiplier is
            // the favoured side. Your fan team's matches are their own bucket: you're
            // locked into backing them, so they say nothing about how you read a price.
            // No favourite (a fixture that never got odds, both sides at 1) counts in
            // none of the three rather than being arbitrarily assigned to one.
            if (isFanTeamGame) myDogPoints += awarded;
            else if (multHome !== multAway) {
                const favoured = multHome < multAway ? 'HOME' : 'AWAY';
                if (side === favoured) topDogPoints += awarded;
                else underDogPoints += awarded;
            }
        }

        // Table-prediction points, summed over every completed week (only if saved).
        let lockedTable = 0;
        let provTable = 0;
        let currentTable = 0;
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
            // The live week's preview, at that week's rate. Deliberately outside
            // the sum above: it hasn't been awarded and isn't part of the total.
            for (const e of liveTable) {
                const pp = predPos.get(e.teamId);
                if (pp == null) continue;
                currentTable += tableScoring(Math.abs(e.position - pp), liveWeek);
            }
        }

        // Every individual award is already an exact tenth; the running sums are
        // floats, so round them before they leave the server.
        return {
            player: u.display_name || u.username,
            fanTeam: fanActive,
            correctPicks,
            drawPoints: round1(drawPoints),
            topDogPoints: round1(topDogPoints),
            underDogPoints: round1(underDogPoints),
            myDogPoints: round1(myDogPoints),
            matchPoints: round1(matchPoints),
            tablePoints: round1(lockedTable + provTable),
            lockedTablePoints: round1(lockedTable),
            provisionalTablePoints: round1(provTable),
            tableProvisional: provTable > 0,
            currentTablePoints: round1(currentTable),
            tableWeek,
            liveWeek,
            total: 0
        };
    });

    board.forEach((b) => (b.total = round1(b.matchPoints + b.tablePoints)));
    board.sort((a, b) => b.total - a.total);
    return board;
}