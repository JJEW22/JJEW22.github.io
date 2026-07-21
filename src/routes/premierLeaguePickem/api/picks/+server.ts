// src/routes/premierLeaguePickem/api/picks/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { getFixtures } from '$lib/server/football';
import { PICK_LOCK_LEAD_MS } from '$lib/season';
import type { RequestHandler } from './$types';

// The integrity point: the deadline is enforced HERE, on the server, using the
// real kickoff time from football-data. Picks lock 15 minutes before kickoff.
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    const joined = (await sql`select pickem_joined_at from users where id = ${locals.user.id}`)[0]?.pickem_joined_at != null;
    if (!joined) return json({ ok: false, error: 'Join the competition first.' }, { status: 403 });
    const { matchweek, picks } = await request.json();

    const fixtures = await getFixtures(matchweek);
    const byId = Object.fromEntries(fixtures.map((f) => [f.id, f]));
    const now = Date.now();

    const accepted: { fixtureId: string; pick: string }[] = [];
    for (const [fixtureId, pick] of Object.entries(picks ?? {}) as [string, string][]) {
        const f = byId[fixtureId];
        if (!f) continue; // unknown fixture
        if (new Date(f.kickoff).getTime() - PICK_LOCK_LEAD_MS <= now) continue; // within 15 min of kickoff -> locked
        if (pick !== 'HOME' && pick !== 'AWAY') continue; // no draws
        accepted.push({ fixtureId, pick });
    }

    for (const r of accepted) {
        await sql`insert into match_picks (user_id, matchweek, fixture_id, pick)
                  values (${locals.user.id}, ${matchweek}, ${r.fixtureId}, ${r.pick})
                  on conflict (user_id, fixture_id) do update set pick = excluded.pick, updated_at = now()`;
    }
    return json({ ok: true, saved: accepted.length });
};