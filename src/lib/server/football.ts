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
}

export type FormResult = 'W' | 'D' | 'L';

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
    form: FormResult[]; // last 5 results, MOST RECENT FIRST; shorter early in the season
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

export async function getFixtures(matchweek: number): Promise<Fixture[]> {
    const data = await fd(`/competitions/PL/matches?matchday=${matchweek}`);
    return (data.matches ?? []).map((m: any) => ({
        id: String(m.id),
        matchweek: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        homeId: tlaToId(m.homeTeam.tla),
        awayId: tlaToId(m.awayTeam.tla),
        homeName: m.homeTeam.shortName || m.homeTeam.name,
        awayName: m.awayTeam.shortName || m.awayTeam.name,
        winner: m.score?.winner ?? null
    }));
}

// Last-5 form per club, most recent first. Derived from finished matches rather
// than football-data's `form` field, which is absent on some plans and doesn't
// document which end is most recent. Ordered by kickoff rather than matchweek, so
// a postponed game counts as recent when it was actually played.
function formGuide(matches: FinishedMatch[]): Map<string, { form: FormResult[]; points: number }> {
    const played = new Map<string, { at: number; result: FormResult }[]>();
    const add = (teamId: string, at: number, result: FormResult) => {
        const list = played.get(teamId);
        if (list) list.push({ at, result });
        else played.set(teamId, [{ at, result }]);
    };

    for (const m of matches) {
        if (m.homeGoals == null || m.awayGoals == null) continue;
        const at = new Date(m.kickoff).getTime();
        if (!Number.isFinite(at)) continue;
        const home: FormResult = m.homeGoals > m.awayGoals ? 'W' : m.homeGoals < m.awayGoals ? 'L' : 'D';
        add(m.homeId, at, home);
        add(m.awayId, at, home === 'W' ? 'L' : home === 'L' ? 'W' : 'D');
    }

    const guide = new Map<string, { form: FormResult[]; points: number }>();
    for (const [teamId, list] of played) {
        const form = list.sort((a, b) => b.at - a.at).slice(0, 5).map((e) => e.result);
        const points = form.reduce((n, r) => n + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
        guide.set(teamId, { form, points });
    }
    return guide;
}

export async function getStandings(): Promise<StandingRow[]> {
    const data = await fd('/competitions/PL/standings');
    // The form guide is a second upstream call. If it fails, still return the
    // table — losing form is a missing column, losing the table is a blank tab.
    let guide = new Map<string, { form: FormResult[]; points: number }>();
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

export async function getFinishedMatches(): Promise<FinishedMatch[]> {
    const data = await fd('/competitions/PL/matches?status=FINISHED');
    return (data.matches ?? []).map((m: any) => ({
        id: String(m.id),
        matchweek: m.matchday,
        kickoff: m.utcDate,
        winner: m.score?.winner ?? 'DRAW',
        homeId: tlaToId(m.homeTeam.tla),
        awayId: tlaToId(m.awayTeam.tla),
        homeGoals: m.score?.fullTime?.home ?? null,
        awayGoals: m.score?.fullTime?.away ?? null
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