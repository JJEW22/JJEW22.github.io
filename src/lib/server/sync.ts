// src/lib/server/sync.ts
// Server-side jobs shared by the Admin buttons and the cron endpoint.
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { getFinishedMatches, getFixtures, getMatchesInWindow, getUpcomingMatches } from '$lib/server/football';
import { pickBonusFixtures, computeTable } from '$lib/server/scoring';
import { fetchOddsMultipliers } from '$lib/server/odds';
import { sendEmail } from '$lib/server/email';
import { getMeta, setMeta } from '$lib/server/appMeta';
import { PICK_LOCK_LEAD_MS } from '$lib/season';

const RESYNC_AFTER_MS = 135 * 60 * 1000; // sync results 135 min after kickoff

// The odds API plan is 500 requests a MONTH, so this job can't ride the 15-minute
// tick the way the others do. Twice a day is ~60 calls and still tracks the market
// closely enough — prices barely move outside the last hours before kickoff.
const ODDS_SYNC_EVERY_MS = 12 * 60 * 60 * 1000;
// After a failure, retry sooner than the full period — an upstream blip shouldn't
// leave a matchweek unpriced — but not every tick, which would burn the quota in a day.
const ODDS_RETRY_MS = 60 * 60 * 1000;
const ODDS_NEXT_KEY = 'next_odds_sync_ms';

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

// Capture de-vigged probabilities + points multipliers onto upcoming fixtures.
//
// A fixture's odds FREEZE WHEN ITS PICKS FREEZE, at kickoff − PICK_LOCK_LEAD_MS,
// not at kickoff. Once you can no longer change your pick, the multiplier that pick
// pays at can no longer change either: the number on the card when it locks is the
// number you're scored with. Freezing at kickoff instead would leave a 15-minute
// window where the price moved under a pick nobody could still edit.
//
// Already-played matches are doubly safe — the odds API only lists upcoming events,
// and anything past its lock is skipped here regardless.
export async function syncOdds() {
    const [odds, fixtures] = await Promise.all([fetchOddsMultipliers(), getUpcomingMatches(45)]);

    const byPair = new Map<string, { id: string; matchweek: number; kickoff: string }>();
    for (const f of fixtures) byPair.set(`${f.homeId}|${f.awayId}`, f);

    const now = Date.now();
    let updated = 0;
    let unmatched = 0;
    let frozen = 0;

    for (const o of odds) {
        const f = byPair.get(`${o.homeId}|${o.awayId}`);
        if (!f) {
            unmatched++;
            continue;
        }
        if (new Date(f.kickoff).getTime() - PICK_LOCK_LEAD_MS <= now) {
            frozen++;
            continue;
        }
        await sql`insert into results (fixture_id, matchweek, home_id, away_id, mult_home, mult_away, prob_home, prob_draw, prob_away)
                  values (${f.id}, ${f.matchweek}, ${o.homeId}, ${o.awayId}, ${o.multHome}, ${o.multAway}, ${o.probHome}, ${o.probDraw}, ${o.probAway})
                  on conflict (fixture_id) do update set
                    mult_home = excluded.mult_home,
                    mult_away = excluded.mult_away,
                    prob_home = excluded.prob_home,
                    prob_draw = excluded.prob_draw,
                    prob_away = excluded.prob_away,
                    home_id = excluded.home_id,
                    away_id = excluded.away_id,
                    updated_at = now()`;
        updated++;
    }

    // A manual run counts as the scheduled one: no point spending another request
    // an hour later because an admin already pressed the button.
    await setMeta(ODDS_NEXT_KEY, String(Date.now() + ODDS_SYNC_EVERY_MS));
    return { updated, unmatched, frozen, oddsEvents: odds.length, fixtures: fixtures.length };
}

// Backstop for the twice-daily odds workflow (.github/workflows/pickem-odds.yml).
// Gated on a stored "next allowed" stamp, so the 15-minute cron tick can call this
// every time without spending the quota: whichever path runs first pushes the stamp
// 12 hours out, and the other stays dormant until it lapses. That means odds keep
// refreshing even if the dedicated workflow is disabled or failing.
export async function oddsSyncIfDue() {
    const next = Number((await getMeta(ODDS_NEXT_KEY)) || 0);
    if (Date.now() < next) {
        return { ran: false as const, reason: `next sync ${new Date(next).toISOString()}` };
    }
    try {
        return { ran: true as const, ...(await syncOdds()) };
    } catch (err) {
        // Returned rather than thrown: a dead odds API must not stop the results
        // sync or the reminders that run alongside this on the same tick.
        console.error('odds sync failed', err);
        await setMeta(ODDS_NEXT_KEY, String(Date.now() + ODDS_RETRY_MS));
        return { ran: false as const, reason: 'odds sync failed', error: String(err) };
    }
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