// src/lib/server/sync.ts
// Server-side jobs shared by the Admin buttons and the cron endpoint.
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { getFinishedMatches, getFixtures, getMatchesInWindow } from '$lib/server/football';
import { pickBonusFixtures, computeTable } from '$lib/server/scoring';
import { sendEmail } from '$lib/server/email';
import { PICK_LOCK_LEAD_MS } from '$lib/season';

const RESYNC_AFTER_MS = 135 * 60 * 1000; // sync results 135 min after kickoff

async function getMeta(key: string): Promise<string | null> {
    const row = (await sql`select value from app_meta where key = ${key}`)[0];
    return row?.value ?? null;
}
async function setMeta(key: string, value: string): Promise<void> {
    await sql`insert into app_meta (key, value, updated_at) values (${key}, ${value}, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// Pull finished results, store goals/winner, and (re)designate the current
// week's golden/silver/bronze bonus matches. Idempotent.
export async function syncResults() {
    const matches = await getFinishedMatches();
    for (const m of matches) {
        await sql`insert into results (fixture_id, matchweek, winner, home_id, away_id, home_goals, away_goals)
                  values (${m.id}, ${m.matchweek}, ${m.winner}, ${m.homeId}, ${m.awayId}, ${m.homeGoals}, ${m.awayGoals})
                  on conflict (fixture_id) do update set
                    winner = excluded.winner, matchweek = excluded.matchweek,
                    home_id = excluded.home_id, away_id = excluded.away_id,
                    home_goals = excluded.home_goals, away_goals = excluded.away_goals, updated_at = now()`;
    }

    const currentWeek = matches.reduce((mx, m) => Math.max(mx, m.matchweek), 0);
    let golden: string | null = null, silver: string | null = null, bronze: string | null = null;
    if (currentWeek >= 1) {
        const fixtures = await getFixtures(currentWeek);
        const ids = fixtures.map((f) => f.id);
        const oddsRows = ids.length
            ? await sql<{ fixture_id: string; prob_home: number | null; prob_away: number | null }[]>`
                select fixture_id, prob_home, prob_away from results where fixture_id = any(${ids})`
            : [];
        const oddsById = new Map(oddsRows.map((r) => [r.fixture_id, r]));
        const finished = await sql<{ matchweek: number; home_id: string | null; away_id: string | null; home_goals: number | null; away_goals: number | null }[]>`
            select matchweek, home_id, away_id, home_goals, away_goals
            from results where home_goals is not null and away_goals is not null`;
        const positions = new Map(computeTable(finished).map((e) => [e.teamId, e.position]));
        const inputs = fixtures.map((f) => {
            const o = oddsById.get(f.id);
            return {
                id: f.id, homeId: f.homeId, awayId: f.awayId,
                probHome: o?.prob_home != null ? Number(o.prob_home) : null,
                probAway: o?.prob_away != null ? Number(o.prob_away) : null
            };
        });
        ({ goldenId: golden, silverId: silver, bronzeId: bronze } = pickBonusFixtures(inputs, currentWeek, positions));
        await sql`update results set bonus = null where matchweek = ${currentWeek}`;
        if (golden) await sql`update results set bonus = 'GOLDEN' where fixture_id = ${golden}`;
        if (silver) await sql`update results set bonus = 'SILVER' where fixture_id = ${silver}`;
        if (bronze) await sql`update results set bonus = 'BRONZE' where fixture_id = ${bronze}`;
    }
    return { synced: matches.length, week: currentWeek, golden, silver, bronze };
}

// Run syncResults() only once per "wave" — 135 min after each distinct kickoff.
// Simultaneous kickoffs share one moment, so they trigger a single sync.
export async function resultsSyncIfDue() {
    const recent = await getMatchesInWindow(1, 0);
    const due = recent
        .map((m) => new Date(m.kickoff).getTime() + RESYNC_AFTER_MS)
        .filter((t) => t <= Date.now());
    if (!due.length) return { ran: false as const, reason: 'no match past +135min' };
    const moment = Math.max(...due);
    const last = Number((await getMeta('last_result_sync_ms')) || 0);
    if (moment <= last) return { ran: false as const, reason: 'already synced this wave' };
    const summary = await syncResults();
    await setMeta('last_result_sync_ms', String(moment));
    return { ran: true as const, moment: new Date(moment).toISOString(), ...summary };
}

// On Wednesday (ET), email enrolled players who still have unmade picks for the
// upcoming matchweek. Sends once per matchweek.
export async function sendPickRemindersIfDue() {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date());
    if (weekday !== 'Wednesday') return { ran: false as const, reason: 'not Wednesday' };

    const upcoming = (await getMatchesInWindow(0, 9)).filter((m) => new Date(m.kickoff).getTime() > Date.now());
    if (!upcoming.length) return { ran: false as const, reason: 'no upcoming matches' };
    const mw = Math.min(...upcoming.map((m) => m.matchweek));

    if (Number((await getMeta('last_reminder_mw')) || 0) === mw) return { ran: false as const, reason: 'already reminded' };

    const fixtures = await getFixtures(mw);
    const users = await sql<{ id: number; email: string | null; fan_team: string | null; predictions_saved_at: Date | null }[]>`
        select id, email, fan_team, predictions_saved_at from users where pickem_joined_at is not null`;
    const picks = await sql<{ user_id: number; fixture_id: string }[]>`select user_id, fixture_id from match_picks`;
    const pickedByUser = new Map<number, Set<string>>();
    for (const p of picks) {
        if (!pickedByUser.has(p.user_id)) pickedByUser.set(p.user_id, new Set());
        pickedByUser.get(p.user_id)!.add(p.fixture_id);
    }
    const link = (env.ORIGIN || '') + '/premierLeaguePickem';

    let sent = 0;
    for (const u of users) {
        if (!u.email) continue;
        const fan = u.predictions_saved_at != null ? u.fan_team : null;
        const missing = fixtures.filter((f) => {
            if (new Date(f.kickoff).getTime() - PICK_LOCK_LEAD_MS <= Date.now()) return false; // already locked
            const has = pickedByUser.get(u.id)?.has(f.id);
            const fanHere = fan && (f.homeId === fan || f.awayId === fan);
            return !has && !fanHere;
        });
        if (missing.length === 0) continue;
        await sendEmail({
            to: u.email,
            subject: `Make your Matchweek ${mw} picks`,
            text:
                `You still have ${missing.length} unmade pick${missing.length === 1 ? '' : 's'} for Matchweek ${mw}.\n\n` +
                `Each pick locks 15 minutes before that match kicks off, so get them in early.\n\n` +
                `Make your picks: ${link}`
        });
        sent++;
    }
    await setMeta('last_reminder_mw', String(mw));
    return { ran: true as const, mw, sent };
}