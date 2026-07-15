// src/lib/plTeams.ts
// Shared source of truth for the 20 Premier League clubs (2026-27).
// `code` is the football-data.org three-letter TLA, used to map API teams to ids.
export interface Team {
    id: string;
    name: string;
    code: string;
}

export const TEAMS: Team[] = [
    { id: 'ars', name: 'Arsenal', code: 'ARS' },
    { id: 'avl', name: 'Aston Villa', code: 'AVL' },
    { id: 'bou', name: 'Bournemouth', code: 'BOU' },
    { id: 'bre', name: 'Brentford', code: 'BRE' },
    { id: 'bha', name: 'Brighton', code: 'BHA' },
    { id: 'che', name: 'Chelsea', code: 'CHE' },
    { id: 'cov', name: 'Coventry City', code: 'COV' },
    { id: 'cry', name: 'Crystal Palace', code: 'CRY' },
    { id: 'eve', name: 'Everton', code: 'EVE' },
    { id: 'ful', name: 'Fulham', code: 'FUL' },
    { id: 'hul', name: 'Hull City', code: 'HUL' },
    { id: 'ips', name: 'Ipswich Town', code: 'IPS' },
    { id: 'lee', name: 'Leeds United', code: 'LEE' },
    { id: 'liv', name: 'Liverpool', code: 'LIV' },
    { id: 'mci', name: 'Manchester City', code: 'MCI' },
    { id: 'mun', name: 'Manchester United', code: 'MUN' },
    { id: 'new', name: 'Newcastle United', code: 'NEW' },
    { id: 'nfo', name: 'Nottingham Forest', code: 'NOT' },
    { id: 'sun', name: 'Sunderland', code: 'SUN' },
    { id: 'tot', name: 'Tottenham', code: 'TOT' }
];

export const teamById: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

const byTla: Record<string, string> = Object.fromEntries(TEAMS.map((t) => [t.code, t.id]));

export function tlaToId(tla: string | undefined): string {
    if (tla && byTla[tla]) return byTla[tla];
    return tla ? tla.toLowerCase() : 'unknown';
}