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

export interface StandingRow {
    teamId: string;
    name: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gd: number;
    points: number;
}

export interface FinishedMatch {
    id: string;
    matchweek: number;
    winner: string;
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

export async function getStandings(): Promise<StandingRow[]> {
    const data = await fd('/competitions/PL/standings');
    const total = (data.standings ?? []).find((s: any) => s.type === 'TOTAL') ?? data.standings?.[0];
    return (total?.table ?? []).map((r: any) => ({
        teamId: tlaToId(r.team.tla),
        name: r.team.shortName || r.team.name,
        played: r.playedGames,
        won: r.won,
        drawn: r.draw,
        lost: r.lost,
        gd: r.goalDifference,
        points: r.points
    }));
}

export async function getFinishedMatches(): Promise<FinishedMatch[]> {
    const data = await fd('/competitions/PL/matches?status=FINISHED');
    return (data.matches ?? []).map((m: any) => ({
        id: String(m.id),
        matchweek: m.matchday,
        winner: m.score?.winner ?? 'DRAW',
        homeId: tlaToId(m.homeTeam.tla),
        awayId: tlaToId(m.awayTeam.tla)
    }));
}

// Matches in a forward date window, used to map odds events to fixture ids.
export async function getUpcomingMatches(daysAhead = 10): Promise<UpcomingMatch[]> {
    const from = new Date().toISOString().slice(0, 10);
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
