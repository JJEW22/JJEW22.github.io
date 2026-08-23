// src/routes/premierLeaguePickem/api/admin/pick-status/+server.ts
// WHO has picked, for matches that have NOT locked yet — so an admin can chase the
// people who still need to. Admin-only, and the mirror image of /api/reveal: that
// one answers "which side" but only after kickoff, this one answers "at all" but
// only before the lock.
//
// THE SIDE IS NEVER RETURNED. `match_picks.pick` is not selected by this query at
// all — not read and dropped, not selected and filtered later. An admin who plays
// must not be able to see what anyone chose while they could still act on it, and
// the cheapest way to guarantee that is for the value never to leave the database.
// If you ever need the side here, you don't — build it somewhere else.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import { getFixtures } from '$lib/server/football';
import { PICK_LOCK_LEAD_MS } from '$lib/season';
import type { RequestHandler } from './$types';

interface Person {
    id: number;
    name: string;
}

export const GET: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);

    const mw = Number(url.searchParams.get('mw')) || 1;

    // An upstream outage shouldn't 500 the tab; the cards just render without this.
    let fixtures: Awaited<ReturnType<typeof getFixtures>> = [];
    try {
        fixtures = await getFixtures(mw);
    } catch (err) {
        console.error(`pick-status: fixtures unavailable for matchweek ${mw}`, err);
        return json({ number: mw, status: {} });
    }

    // Open fixtures only. A locked match is the reveal endpoint's business, and
    // limiting the set here means a late pick can't be inferred by diffing this
    // against the reveal after the fact.
    const now = Date.now();
    const open = fixtures.filter((f) => new Date(f.kickoff).getTime() - PICK_LOCK_LEAD_MS > now);
    if (!open.length) return json({ number: mw, status: {} });

    const ids = open.map((f) => f.id);
    const members = await sql<Person[]>`
        select id, coalesce(display_name, username) as name
        from users where pickem_joined_at is not null`;

    // Note the columns: user_id and fixture_id. Deliberately not `pick`.
    const made = await sql<{ user_id: number; fixture_id: string }[]>`
        select user_id, fixture_id from match_picks where fixture_id = any(${ids})`;
    const byFixture = new Map<string, Set<number>>();
    for (const id of ids) byFixture.set(id, new Set());
    for (const r of made) byFixture.get(r.fixture_id)?.add(r.user_id);

    // A fan whose club is playing is auto-picked and has nothing to do, so they
    // count as sorted rather than missing — chasing them would be noise.
    const fans = await sql<{ id: number; fan_team: string }[]>`
        select id, fan_team from users
        where pickem_joined_at is not null and predictions_saved_at is not null and fan_team is not null`;
    const fanById = new Map(fans.map((f) => [f.id, f.fan_team]));

    const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
    const status: Record<string, { picked: Person[]; fan: Person[]; missing: Person[] }> = {};
    for (const f of open) {
        const done = byFixture.get(f.id) ?? new Set<number>();
        const picked: Person[] = [];
        const fan: Person[] = [];
        const missing: Person[] = [];
        for (const u of members) {
            const club = fanById.get(u.id);
            if (club && (f.homeId === club || f.awayId === club)) fan.push(u);
            else if (done.has(u.id)) picked.push(u);
            else missing.push(u);
        }
        status[f.id] = { picked: picked.sort(byName), fan: fan.sort(byName), missing: missing.sort(byName) };
    }

    return json({ number: mw, status });
};
