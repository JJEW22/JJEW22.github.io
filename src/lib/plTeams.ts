// src/lib/plTeams.ts
// Shared source of truth for the 20 Premier League clubs (2026-27).
// `code` is the football-data.org three-letter TLA, used to map API teams to ids.
export interface Team {
    id: string;
    name: string;
    code: string;
    color: string; // club colour, used for the "your team" highlight/tag
}

export const TEAMS: Team[] = [
    { id: 'ars', name: 'Arsenal', code: 'ARS', color: '#EF0107'  },
    { id: 'avl', name: 'Aston Villa', code: 'AVL', color: '#670E36'  },
    { id: 'bou', name: 'Bournemouth', code: 'BOU', color: '#DA291C'  },
    { id: 'bre', name: 'Brentford', code: 'BRE', color: '#E30613'  },
    { id: 'bha', name: 'Brighton', code: 'BHA', color: '#2F7FD1'  },
    { id: 'che', name: 'Chelsea', code: 'CHE', color: '#034694'  },
    { id: 'cov', name: 'Coventry City', code: 'COV', color: '#6CADDF'  },
    { id: 'cry', name: 'Crystal Palace', code: 'CRY', color: '#1B458F'  },
    { id: 'eve', name: 'Everton', code: 'EVE', color: '#003399'  },
    { id: 'ful', name: 'Fulham', code: 'FUL', color: '#1A1A1A'  },
    { id: 'hul', name: 'Hull City', code: 'HUL', color: '#F5A12D'  },
    { id: 'ips', name: 'Ipswich Town', code: 'IPS', color: '#3A64A3'  },
    { id: 'lee', name: 'Leeds United', code: 'LEE', color: '#1D428A'  },
    { id: 'liv', name: 'Liverpool', code: 'LIV', color: '#C8102E'  },
    { id: 'mci', name: 'Manchester City', code: 'MCI', color: '#6CABDD'  },
    { id: 'mun', name: 'Manchester United', code: 'MUN', color: '#DA291C'  },
    { id: 'new', name: 'Newcastle United', code: 'NEW', color: '#241F20'  },
    { id: 'nfo', name: 'Nottingham Forest', code: 'NOT', color: '#DD0000'  },
    { id: 'sun', name: 'Sunderland', code: 'SUN', color: '#EB172B'  },
    { id: 'tot', name: 'Tottenham', code: 'TOT', color: '#132257'  }
];

export const teamById: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

const byTla: Record<string, string> = Object.fromEntries(TEAMS.map((t) => [t.code, t.id]));

export function tlaToId(tla: string | undefined): string {
    if (tla && byTla[tla]) return byTla[tla];
    return tla ? tla.toLowerCase() : 'unknown';
}