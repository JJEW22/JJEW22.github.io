// src/routes/premierLeaguePickem/api/features/+server.ts
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { sendEmail, ADMIN_EMAIL } from '$lib/server/email';
import type { RequestHandler } from './$types';

// One feature request per participant per 2-week cycle. Cycles are anchored to a
// fixed date so everyone shares the same window; "starting immediately" = cycle 0
// is open now. Submissions are emailed to the admin and reset each cycle.
const ANCHOR = Date.parse('2026-07-20T00:00:00-04:00');
const CYCLE_MS = 14 * 86400000;
const MAX_LEN = 280; // was 100 in the spec; see note. One constant to change.

function cycleNow() {
    return Math.max(0, Math.floor((Date.now() - ANCHOR) / CYCLE_MS));
}
function nextResetISO() {
    return new Date(ANCHOR + (cycleNow() + 1) * CYCLE_MS).toISOString();
}
function isAdmin(roles: string[] | undefined) {
    return !!roles && (roles.includes('site:admin') || roles.includes('pickem:admin'));
}

export const GET: RequestHandler = async ({ locals }) => {
    const cycle = cycleNow();
    const base = { cycle, maxLen: MAX_LEN, nextReset: nextResetISO(), signedIn: !!locals.user };
    if (!locals.user) return json({ ...base, joined: false, mine: null });

    // Membership lives on the users table (always present).
    let joined = false;
    try {
        const me = (await sql`select pickem_joined_at from users where id = ${locals.user.id}`)[0];
        joined = me?.pickem_joined_at != null;
    } catch (err) {
        console.error('features: membership lookup failed', err);
    }

    // The feature_requests table may not exist yet (migration not run). If that
    // read fails, don't let it flip the user to "signed out" — just skip the data.
    let mine: string | null = null;
    let submissions;
    try {
        mine = (await sql`select body from feature_requests where user_id = ${locals.user.id} and cycle = ${cycle}`)[0]?.body ?? null;
        if (isAdmin(locals.user.roles)) {
            submissions = await sql`
                select coalesce(u.display_name, u.username) as name, f.body, f.created_at
                from feature_requests f join users u on u.id = f.user_id
                where f.cycle = ${cycle} order by f.created_at desc`;
        }
    } catch (err) {
        console.error('features: request lookup failed — has schema-features-cron.sql been run?', err);
    }

    return json({ ...base, joined, mine, submissions });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    const me = (await sql`select pickem_joined_at, display_name, username from users where id = ${locals.user.id}`)[0];
    if (me?.pickem_joined_at == null) return json({ ok: false, error: 'Join the competition first.' }, { status: 403 });

    const { body } = await request.json();
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) return json({ ok: false, error: 'Write something first.' }, { status: 400 });
    if (text.length > MAX_LEN) return json({ ok: false, error: `Keep it to ${MAX_LEN} characters.` }, { status: 400 });

    const cycle = cycleNow();
    await sql`insert into feature_requests (user_id, cycle, body) values (${locals.user.id}, ${cycle}, ${text})
              on conflict (user_id, cycle) do update set body = excluded.body, created_at = now()`;

    const who = me.display_name || me.username;
    await sendEmail({
        to: ADMIN_EMAIL,
        subject: `Pickem feature request (cycle ${cycle}) from ${who}`,
        text: `${who} requested:\n\n${text}\n\n— ${(env.ORIGIN || '') + '/featureRequests'}`
    });

    return json({ ok: true, mine: text });
};