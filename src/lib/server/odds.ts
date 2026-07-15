// src/lib/server/odds.ts
import { env } from '$env/dynamic/private';
import { TEAMS } from '$lib/plTeams';

const ODDS_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'soccer_epl';

function normalize(s: string): string {
    return s
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z ]/g, '')
        .replace(/\b(fc|afc)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const ALIASES: Record<string, string> = {
    // add here only if a club refuses to match, e.g. 'spurs': 'tot'
};
export function resolveTeamId(name: string): string | null {
    const n = normalize(name);
    if (ALIASES[n]) return ALIASES[n];
    for (const t of TEAMS) if (normalize(t.name) === n) return t.id;
    for (const t of TEAMS) {
        const tokens = normalize(t.name).split(' ');
        if (tokens.every((tok) => n.includes(tok))) return t.id;
    }
    return null;
}

export interface OddsMultipliers {
    homeId: string;
    awayId: string;
    commenceTime: string;
    probHome: number; // de-vigged fair probabilities (sum to 1)
    probDraw: number;
    probAway: number;
    multHome: number; // points multiplier 1 / (P_win + 0.5 * P_tie)
    multAway: number;
}

export async function fetchOddsMultipliers(): Promise<OddsMultipliers[]> {
    if (!env.ODDS_API_KEY) throw new Error('ODDS_API_KEY is not set');
    const url = `${ODDS_BASE}/sports/${SPORT}/odds?regions=uk&markets=h2h&oddsFormat=decimal&apiKey=${env.ODDS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`odds api ${res.status}: ${await res.text()}`);
    const events: any[] = await res.json();

    const out: OddsMultipliers[] = [];
    for (const ev of events) {
        const homeId = resolveTeamId(ev.home_team);
        const awayId = resolveTeamId(ev.away_team);
        if (!homeId || !awayId) continue;

        let sumH = 0,
            sumD = 0,
            sumA = 0,
            books = 0;
        for (const bk of ev.bookmakers ?? []) {
            const market = (bk.markets ?? []).find((m: any) => m.key === 'h2h');
            if (!market) continue;
            const oc = market.outcomes ?? [];
            const priceOf = (teamName: string) => oc.find((x: any) => x.name === teamName)?.price;
            const dh = priceOf(ev.home_team);
            const da = priceOf(ev.away_team);
            const dd = oc.find((x: any) => x.name === 'Draw')?.price;
            if (!dh || !da || !dd) continue;
            sumH += 1 / dh;
            sumD += 1 / dd;
            sumA += 1 / da;
            books++;
        }
        if (books === 0) continue;

        // Average implied probs across books, then de-vig (normalize to sum 1).
        const qH = sumH / books,
            qD = sumD / books,
            qA = sumA / books;
        const total = qH + qD + qA;
        const pH = qH / total,
            pD = qD / total,
            pA = qA / total;

        out.push({
            homeId,
            awayId,
            commenceTime: ev.commence_time,
            probHome: pH,
            probDraw: pD,
            probAway: pA,
            multHome: 1 / (pH + 0.5 * pD),
            multAway: 1 / (pA + 0.5 * pD)
        });
    }
    return out;
}