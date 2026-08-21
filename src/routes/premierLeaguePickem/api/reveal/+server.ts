// src/routes/premierLeaguePickem/api/reveal/+server.ts
// Who picked which side, for matches that have already kicked off.
//
// The integrity point, same as the picks route: the cutoff is enforced HERE using
// the real kickoff time from football-data. A fixture that has not started is not
// in the response at all, so this endpoint can never leak a live pick — picks lock
// 15 minutes before kickoff, so everything returned is settled.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { getFixtures } from '$lib/server/football';
import { coinPick } from '$lib/pickemScoring';
import type { RequestHandler } from './$types';

interface Picker {
    id: number;
    name: string;
    fan: boolean; // forced: the club is their fan team
    auto: boolean; // never picked, so the coin decided — at a reduced weight
}

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    const me = (await sql`select pickem_joined_at from users where id = ${locals.user.id}`)[0];
    if (!me?.pickem_joined_at) {
        return json({ ok: false, error: 'Join the competition first.' }, { status: 403 });
    }

    const mw = Number(url.searchParams.get('mw')) || 1;

    // No fixtures means no reveal — a football-data outage shouldn't 500 the tab.
    let fixtures: Awaited<ReturnType<typeof getFixtures>> = [];
    try {
        fixtures = await getFixtures(mw);
    } catch (err) {
        console.error(`reveal: fixtures unavailable for matchweek ${mw}`, err);
        return json({ number: mw, picks: {} });
    }

    const now = Date.now();
    const started = fixtures.filter((f) => new Date(f.kickoff).getTime() <= now);
    if (!started.length) return json({ number: mw, picks: {} });

    const ids = started.map((f) => f.id);
    const stored = await sql<{ fixture_id: string; pick: string; id: number; name: string }[]>`
        select p.fixture_id, p.pick, u.id, coalesce(u.display_name, u.username) as name
        from match_picks p join users u on u.id = p.user_id
        where p.fixture_id = any(${ids}) and u.pickem_joined_at is not null`;

    // Everyone in the competition, because a player with no pick still gets a side
    // once the match locks — the coin decides. Same derivation the leaderboard uses.
    const members = await sql<{ id: number; name: string }[]>`
        select id, coalesce(display_name, username) as name
        from users where pickem_joined_at is not null`;

    // Fan-team picks are never written to match_picks — they're implied by the fan
    // team, and computeLeaderboard() gives them precedence over a stored pick. Both
    // of those have to be mirrored here or the lists would be wrong: someone would
    // be missing entirely, or shown on the side they no longer count as picking.
    const fans = await sql<{ id: number; name: string; fan_team: string }[]>`
        select id, coalesce(display_name, username) as name, fan_team
        from users
        where pickem_joined_at is not null and predictions_saved_at is not null and fan_team is not null`;

    // fixture id -> user id -> which side they're on.
    //
    // Seeded with the started fixtures and NEVER grown after: a row naming any other
    // fixture is dropped below rather than creating a slot. That makes "no unstarted
    // match can appear in the response" a property of this structure, instead of
    // resting solely on the `any(${ids})` filter in the query above.
    const sides = new Map<string, Map<number, { side: string; picker: Picker }>>();
    for (const f of started) sides.set(f.id, new Map());

    // Three passes, weakest first, each overwriting the last — the same precedence
    // computeLeaderboard() applies: fan team beats a stored pick, a stored pick
    // beats the coin.
    for (const f of started) {
        const forFixture = sides.get(f.id);
        if (!forFixture) continue;
        for (const u of members) {
            forFixture.set(u.id, {
                side: coinPick(u.id, f.id),
                picker: { id: u.id, name: u.name, fan: false, auto: true }
            });
        }
    }

    for (const r of stored) {
        if (r.pick !== 'HOME' && r.pick !== 'AWAY') continue;
        const forFixture = sides.get(r.fixture_id);
        if (!forFixture) continue; // not a started fixture — must not be revealed
        forFixture.set(r.id, {
            side: r.pick,
            picker: { id: r.id, name: r.name, fan: false, auto: false }
        });
    }

    for (const f of started) {
        const forFixture = sides.get(f.id);
        if (!forFixture) continue;
        for (const u of fans) {
            const side = f.homeId === u.fan_team ? 'HOME' : f.awayId === u.fan_team ? 'AWAY' : null;
            if (!side) continue;
            forFixture.set(u.id, { side, picker: { id: u.id, name: u.name, fan: true, auto: false } });
        }
    }

    const byName = (a: Picker, b: Picker) => a.name.localeCompare(b.name);
    const picks: Record<string, { home: Picker[]; away: Picker[] }> = {};
    for (const [fixtureId, users] of sides) {
        const home: Picker[] = [];
        const away: Picker[] = [];
        for (const { side, picker } of users.values()) (side === 'HOME' ? home : away).push(picker);
        picks[fixtureId] = { home: home.sort(byName), away: away.sort(byName) };
    }

    return json({ number: mw, picks });
};
