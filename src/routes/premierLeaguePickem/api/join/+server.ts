// src/routes/premierLeaguePickem/api/join/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Opt in to the pickem competition. Having a site account does NOT enrol you;
// you join here explicitly. Idempotent — joining again keeps the first timestamp.
export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    await sql`update users set pickem_joined_at = coalesce(pickem_joined_at, now()) where id = ${locals.user.id}`;
    return json({ ok: true, joined: true });
};