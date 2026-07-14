// src/routes/premierLeaguePickem/api/fan-team/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { teamById } from '$lib/plTeams';
import type { RequestHandler } from './$types';

// Set the season-long fan team. Locked once chosen (rule 1).
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    const { team } = await request.json();
    if (!team || !teamById[team]) return json({ ok: false, error: 'Unknown team.' }, { status: 400 });

    const existing = (await sql`select fan_team from users where id = ${locals.user.id}`)[0];
    if (existing?.fan_team) {
        return json({ ok: false, error: 'Your team is already locked for the season.' }, { status: 409 });
    }
    await sql`update users set fan_team = ${team} where id = ${locals.user.id}`;
    return json({ ok: true, fanTeam: team });
};