// src/lib/server/football.ts
import { env } from '$env/dynamic/private';
import { tlaToId } from '$lib/plTeams';

const BASE = 'https://api.football-data.org/v4';

export interface Fixture {
    id: string;
    matchweek: number;
    kickoff: string;
    status: string;
    homeId: string;
    awayId: string;
    homeName: string;
    awayName: string;
    winner: string | null;
    homeGoals: number | null; // null until the match has a score to report
    awayGoals: number | null;
}

export type FormResult = 'W' | 'D' | 'L';

// One match in a club's recent form. Carries enough to explain the result on
// hover -- who it was against, the score from THIS club's point of view, and
// which ground -- rather than just the letter.
export interface FormEntry {
    result: FormResult;
    opponentId: string;
    home: boolean;
    gf: number; // goals for, from this club's perspective
    ga: number;
    kickoff: string;
}

export interface StandingRow {
    teamId: string;
    name: string;
    crest: string | null; // club badge URL from football-data; null if unavailable
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gd: number;
    points: number;
    form: FormEntry[]; // last 5 matches, MOST RECENT FIRST; shorter early in the season
    formPoints: number; // points won across those matches (0-15)
}

export interface FinishedMatch {
    id: string;
    matchweek: number;
    kickoff: string;
    winner: string;
    homeId: string;
    awayId: string;
    homeGoals: number | null;
    awayGoals: number | null;
}

// A match as the schedule knows it, whether or not it has been played.
export interface ScheduledMatch {
    id: string;
    matchweek: number;
    kickoff: string;
    status: string;
    played: boolean;
    homeId: string;
    awayId: string;
}

export interface UpcomingMatch {
    id: string;
    matchweek: number;
    kickoff: string;
    homeId: string;
    awayId: string;
}

const cache = new Map<string, { at: number; data: any }>();
const TTL_MS = 60 * 1000;

async function fd(path: string): Promise<any> {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
    if (!env.FOOTBALL_DATA_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN is not set');
    const res = await fetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN } });
    if (!res.ok) throw new Error(`football-data ${res.status} on ${path}`);
    const data = await res.json();
    cache.set(path, { at: Date.now(), data });
    return data;
}

// EVERY match in the season, fully mapped, from a single cached call.
//
// /competitions/PL/matches returns all 380 fixtures across all 38 matchdays with
// every field below, so the per-week, whole-season and finished-only lists are all
// just filters over this. They used to be four different API paths -- and because
// `?matchday=N` is a distinct cache key per week, paging through the season was one
// upstream request per week and tripped football-data's 10-per-minute limit around
// week 11.
async function allMatches(): Promise<Fixture[]> {
    const data = await fd('/competitions/PL/matches');
    return (data.matches ?? []).map((m: any) => ({
        id: String(m.id),
        matchweek: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        homeId: tlaToId(m.homeTeam.tla),
        awayId: tlaToId(m.awayTeam.tla),
        homeName: m.homeTeam.shortName || m.homeTeam.name,
        awayName: m.awayTeam.shortName || m.awayTeam.name,
        winner: m.score?.winner ?? null,
        homeGoals: m.score?.fullTime?.home ?? null,
        awayGoals: m.score?.fullTime?.away ?? null
    }));
}

export async function getFixtures(matchweek: number): Promise<Fixture[]> {
    // Sorted explicitly rather than trusting the upstream order, so a week's cards
    // always appear earliest-first.
    return (await allMatches())
        .filter((m) => m.matchweek === matchweek)
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

// Last-5 form per club, most recent first. Derived from finished matches rather
// than football-data's `form` field, which is absent on some plans and doesn't
// document which end is most recent. Ordered by kickoff rather than matchweek, so
// a postponed game counts as recent when it was actually played.
function formGuide(matches: FinishedMatch[]): Map<string, { form: FormEntry[]; points: number }> {
    const played = new Map<string, { at: number; entry: FormEntry }[]>();
    const add = (teamId: string, at: number, entry: FormEntry) => {
        const list = played.get(teamId);
        if (list) list.push({ at, entry });
        else played.set(teamId, [{ at, entry }]);
    };

    for (const m of matches) {
        if (m.homeGoals == null || m.awayGoals == null) continue;
        const at = new Date(m.kickoff).getTime();
        if (!Number.isFinite(at)) continue;
        const home: FormResult = m.homeGoals > m.awayGoals ? 'W' : m.homeGoals < m.awayGoals ? 'L' : 'D';
        // Goals are stored per club rather than per fixture, so each side reads its
        // own row as "we scored gf, they scored ga" with no perspective flipping
        // left to the UI.
        add(m.homeId, at, {
            result: home,
            opponentId: m.awayId,
            home: true,
            gf: m.homeGoals,
            ga: m.awayGoals,
            kickoff: m.kickoff
        });
        add(m.awayId, at, {
            result: home === 'W' ? 'L' : home === 'L' ? 'W' : 'D',
            opponentId: m.homeId,
            home: false,
            gf: m.awayGoals,
            ga: m.homeGoals,
            kickoff: m.kickoff
        });
    }

    const guide = new Map<string, { form: FormEntry[]; points: number }>();
    for (const [teamId, list] of played) {
        const form = list.sort((a, b) => b.at - a.at).slice(0, 5).map((e) => e.entry);
        const points = form.reduce((n, e) => n + (e.result === 'W' ? 3 : e.result === 'D' ? 1 : 0), 0);
        guide.set(teamId, { form, points });
    }
    return guide;
}

export async function getStandings(): Promise<StandingRow[]> {
    const data = await fd('/competitions/PL/standings');
    // The form guide is a second upstream call. If it fails, still return the
    // table — losing form is a missing column, losing the table is a blank tab.
    let guide = new Map<string, { form: FormEntry[]; points: number }>();
    try {
        guide = formGuide(await getFinishedMatches());
    } catch (err) {
        console.error('standings: form guide unavailable, returning table without it', err);
    }
    const total = (data.standings ?? []).find((s: any) => s.type === 'TOTAL') ?? data.standings?.[0];
    return (total?.table ?? []).map((r: any) => {
        const teamId = tlaToId(r.team.tla);
        const f = guide.get(teamId);
        return {
            teamId,
            name: r.team.shortName || r.team.name,
            crest: r.team.crest ?? null,
            played: r.playedGames,
            won: r.won,
            drawn: r.draw,
            lost: r.lost,
            gd: r.goalDifference,
            points: r.points,
            form: f?.form ?? [],
            formPoints: f?.points ?? 0
        };
    });
}

// Every match in the season, played or not. The leaderboard needs the whole
// schedule to tell a matchweek that is over from one that is still being played.
export async function getSeasonMatches(): Promise<ScheduledMatch[]> {
    return (await allMatches()).map((m) => ({
        id: m.id,
        matchweek: m.matchweek,
        kickoff: m.kickoff,
        status: m.status,
        played: m.status === 'FINISHED' || m.status === 'AWARDED',
        homeId: m.homeId,
        awayId: m.awayId
    }));
}

export async function getFinishedMatches(): Promise<FinishedMatch[]> {
    // Exactly what ?status=FINISHED returned: AWARDED is deliberately NOT included,
    // matching the previous behaviour rather than getSeasonMatches' broader `played`.
    return (await allMatches())
        .filter((m) => m.status === 'FINISHED')
        .map((m) => ({
            id: m.id,
            matchweek: m.matchweek,
            kickoff: m.kickoff,
            winner: m.winner ?? 'DRAW',
            homeId: m.homeId,
            awayId: m.awayId,
            homeGoals: m.homeGoals,
            awayGoals: m.awayGoals
        }));
}

// Matches within a date window relative to now: `daysBack` days in the past to
// `daysAhead` days in the future. Used by the cron jobs to find recently-finished
// kickoffs (backward) and matches coming up soon (forward).
export async function getMatchesInWindow(daysBack = 0, daysAhead = 10): Promise<UpcomingMatch[]> {
    const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
    const data = await fd(`/competitions/PL/matches?dateFrom=${from}&dateTo=${to}`);
    return (data.matches ?? []).map((m: any) => ({
        id: String(m.id),
        matchweek: m.matchday,
        kickoff: m.utcDate,
        homeId: tlaToId(m.homeTeam.tla),
        awayId: tlaToId(m.awayTeam.tla)
    }));
}

// Matches in a forward date window, used to map odds events to fixture ids.
export async function getUpcomingMatches(daysAhead = 10): Promise<UpcomingMatch[]> {
    return getMatchesInWindow(0, daysAhead);
}