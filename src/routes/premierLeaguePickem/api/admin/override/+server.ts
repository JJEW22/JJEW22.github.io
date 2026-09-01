// src/routes/premierLeaguePickem/api/admin/override/+server.ts
// Admin editorial powers: change another player's match pick or season predictions,
// bypassing the locks that bind the players themselves.
//
// Every rule this endpoint enforces was a deliberate call, so they're stated here:
//
//   - RETROACTIVE ONLY. A pick can only be overridden once its match has locked
//     (15 minutes before kickoff). Editing an upcoming match would mean an admin
//     could read live picks, which the reveal endpoint is built to prevent.
//   - THE FAN TEAM CAN BE OVERRIDDEN, ONE MATCH AT A TIME. Precedence in scoring is
//     fan override > fan team > stored pick > coin. Moving a player off their club in
//     a match their club plays in requires `fanOverride: true` in the body, which the
//     client only sends after showing its own warning. The pick is then pinned: a
//     later fan-team change cannot rewrite it, which is the bug this exists to fix.
//   - THE PENALTY IS A CHOICE. A player with no pick scores at AUTO_PICK_PENALTY
//     fewer base points. When an admin places them on a side, `autoPenalty` says
//     whether that stays: false rewrites history as a real pick, true keeps the
//     penalty and only moves which side they're on.
//   - EVERY WRITE IS LOGGED, including before/after, and including an admin editing
//     their own entry — the one edit nobody else is in a position to check.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import { getFixtures, getSeasonMatches } from '$lib/server/football';
import { teamById } from '$lib/plTeams';
import { PICK_LOCK_LEAD_MS } from '$lib/season';
import type { RequestHandler } from './$types';

interface Target {
    id: number;
    name: string;
    fan_team: string | null;
    display_name: string | null;
    predictions_saved_at: Date | null;
}

export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);
    // requireAdmin also passes for a valid SYNC_SECRET, which has no user attached.
    // An override has to be attributable, so a human admin session is required.
    if (!locals.user) return json({ ok: false, error: 'Sign in as an admin.' }, { status: 401 });

    const body = await request.json();
    const { kind, userId, note } = body ?? {};
    const targetId = Number(userId);
    if (!Number.isInteger(targetId)) {
        return json({ ok: false, error: 'Which player?' }, { status: 400 });
    }

    const target = (
        await sql<Target[]>`select id, coalesce(display_name, username) as name, fan_team, display_name, predictions_saved_at
                            from users where id = ${targetId} and pickem_joined_at is not null`
    )[0];
    if (!target) return json({ ok: false, error: 'No such player in the competition.' }, { status: 404 });

    const reason = typeof note === 'string' ? note.trim().slice(0, 300) : '';

    if (kind === 'pick') return overridePick(locals.user.id, target, body, reason);
    if (kind === 'season') return overrideSeason(locals.user.id, target, body, reason);
    return json({ ok: false, error: 'Unknown override kind.' }, { status: 400 });
};

async function overridePick(
    adminId: number,
    target: Target,
    body: any,
    note: string
): Promise<Response> {
    const { fixtureId, matchweek, pick, autoPenalty } = body ?? {};
    if (pick !== 'HOME' && pick !== 'AWAY') {
        return json({ ok: false, error: 'A pick is HOME or AWAY.' }, { status: 400 });
    }

    // The fixture is looked up from football-data rather than trusted from the
    // client, for the same reason the picks route does it: the lock is only as
    // good as the kickoff time it's measured against.
    const mw = Number(matchweek);
    if (!Number.isInteger(mw)) return json({ ok: false, error: 'Which matchweek?' }, { status: 400 });
    const fixture = (await getFixtures(mw)).find((f) => f.id === String(fixtureId));
    if (!fixture) return json({ ok: false, error: 'No such fixture in that matchweek.' }, { status: 404 });

    if (new Date(fixture.kickoff).getTime() - PICK_LOCK_LEAD_MS > Date.now()) {
        return json(
            { ok: false, error: 'That match has not locked yet. Overrides are retroactive only.' },
            { status: 409 }
        );
    }

    // Moving someone off their own club contradicts a season-long rule, so it needs
    // the admin to have said so for THIS match — the client shows a specific warning
    // and only then sends the flag. Refusing without it beats doing it by accident.
    const fanPlaysHere = !!(
        target.predictions_saved_at &&
        target.fan_team &&
        (fixture.homeId === target.fan_team || fixture.awayId === target.fan_team)
    );
    if (fanPlaysHere && !body?.fanOverride) {
        const club = teamById[target.fan_team!]?.name ?? target.fan_team;
        return json(
            {
                ok: false,
                error: `${target.name} is auto-picked to ${club} in this match. Confirm the fan-team override to move them.`
            },
            { status: 409 }
        );
    }

    const keepPenalty = !!autoPenalty;
    const existing = (
        await sql<{ pick: string; auto_penalty: boolean; fan_override: boolean }[]>`
            select pick, auto_penalty, fan_override from match_picks
            where user_id = ${target.id} and fixture_id = ${fixture.id}`
    )[0];

    // Set on EVERY retroactive pick, not just the ones that need it today. This route
    // only touches matches that have already locked, and an editorial decision about a
    // settled match should not be silently undone by a later fan-team change — which is
    // exactly the way picks got rewritten before the flag existed.
    const fanOverride = true;

    await sql.begin(async (tx) => {
        await tx`insert into match_picks (user_id, matchweek, fixture_id, pick, auto_penalty, fan_override)
                 values (${target.id}, ${mw}, ${fixture.id}, ${pick}, ${keepPenalty}, ${fanOverride})
                 on conflict (user_id, fixture_id) do update set
                   pick = excluded.pick,
                   auto_penalty = excluded.auto_penalty,
                   fan_override = excluded.fan_override,
                   matchweek = excluded.matchweek,
                   updated_at = now()`;
        await tx`insert into admin_edits (admin_id, target_id, kind, fixture_id, matchweek, before, after, note)
                 values (${adminId}, ${target.id}, 'pick', ${fixture.id}, ${mw},
                         ${tx.json(existing ? { pick: existing.pick, autoPenalty: existing.auto_penalty, fanOverride: existing.fan_override } : null)},
                         ${tx.json({ pick, autoPenalty: keepPenalty, fanOverride, overrodeFanTeam: fanPlaysHere })},
                         ${note || null})`;
    });

    return json({
        ok: true,
        player: target.name,
        fixtureId: fixture.id,
        pick,
        autoPenalty: keepPenalty,
        overrodeFanTeam: fanPlaysHere
    });
}

async function overrideSeason(
    adminId: number,
    target: Target,
    body: any,
    note: string
): Promise<Response> {
    const { fanTeam, tableOrder, displayName } = body ?? {};

    if (!fanTeam || !teamById[fanTeam]) return json({ ok: false, error: 'Pick a fan team.' }, { status: 400 });
    if (!Array.isArray(tableOrder) || tableOrder.length !== 20 || new Set(tableOrder).size !== 20) {
        return json({ ok: false, error: 'Order all 20 teams.' }, { status: 400 });
    }
    for (const id of tableOrder) {
        if (!teamById[id]) return json({ ok: false, error: 'Unknown team in order.' }, { status: 400 });
    }
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (name.length > 40) return json({ ok: false, error: 'Name must be 40 characters or fewer.' }, { status: 400 });

    const prior = (
        await sql<{ team_order: unknown }[]>`select team_order from table_predictions where user_id = ${target.id}`
    )[0];
    let priorOrder: string[] = [];
    try {
        priorOrder = Array.isArray(prior?.team_order)
            ? (prior!.team_order as string[])
            : prior
                ? JSON.parse(String(prior.team_order))
                : [];
    } catch (err) {
        console.error(`override: unreadable team_order for user ${target.id}`, err);
    }

    // A fan team is a forward-looking setting, but the picks it implies are not
    // stored anywhere — scoring derives them from `fan_team` every time it runs. So
    // changing it would strip the pick off every match the OLD club already played,
    // dropping those matches through to the coin: a settled, correct call becomes a
    // 50/50 that also takes the no-pick penalty. Write them down as real picks first,
    // on the side the player was actually on, and their history survives the edit.
    //
    // Only matches past their lock. Future ones are still theirs to pick, and the new
    // club will imply its own picks there.
    let preserved = 0;
    const changingFan = !!target.fan_team && target.fan_team !== fanTeam;
    /** Fixtures the old club has already had locked. */
    let toPreserve: { id: string; matchweek: number; side: 'HOME' | 'AWAY' }[] = [];
    if (changingFan) {
        const old = target.fan_team!;
        try {
            const now = Date.now();
            toPreserve = (await getSeasonMatches())
                .filter((m) => m.homeId === old || m.awayId === old)
                .filter((m) => new Date(m.kickoff).getTime() - PICK_LOCK_LEAD_MS <= now)
                .map((m) => ({
                    id: m.id,
                    matchweek: m.matchweek,
                    side: m.homeId === old ? ('HOME' as const) : ('AWAY' as const)
                }));
        } catch (err) {
            // Refusing beats guessing: without the schedule we can't tell which of
            // the old club's matches have locked, and writing none of them would
            // silently randomize this player's settled results.
            console.error('override: schedule unavailable, refusing to change fan team', err);
            return json(
                { ok: false, error: 'Could not reach the fixture list, so the fan-team change was not applied. Try again shortly.' },
                { status: 503 }
            );
        }
    }

    await sql.begin(async (tx) => {
        for (const m of toPreserve) {
            // `do nothing`: a pick the player made themselves always wins over one
            // we're reconstructing, and re-running this must not double-write.
            const res = await tx`insert into match_picks (user_id, matchweek, fixture_id, pick, auto_penalty)
                                 values (${target.id}, ${m.matchweek}, ${m.id}, ${m.side}, false)
                                 on conflict (user_id, fixture_id) do nothing`;
            preserved += res.count ?? 0;
        }
        // predictions_saved_at is set if it wasn't already: an admin filling in a
        // table for someone who never saved should switch their table points on,
        // exactly as their own first save would have.
        await tx`update users
                 set fan_team = ${fanTeam},
                     display_name = ${name || null},
                     predictions_saved_at = coalesce(predictions_saved_at, now())
                 where id = ${target.id}`;
        await tx`insert into table_predictions (user_id, team_order)
                 values (${target.id}, ${tx.json(tableOrder)})
                 on conflict (user_id) do update set team_order = excluded.team_order, updated_at = now()`;
        await tx`insert into admin_edits (admin_id, target_id, kind, before, after, note)
                 values (${adminId}, ${target.id}, 'season',
                         ${tx.json({ fanTeam: target.fan_team, displayName: target.display_name, tableOrder: priorOrder })},
                         ${tx.json({ fanTeam, displayName: name || null, tableOrder, preservedPicks: preserved })},
                         ${note || null})`;
    });

    return json({ ok: true, player: target.name, preserved });
}
