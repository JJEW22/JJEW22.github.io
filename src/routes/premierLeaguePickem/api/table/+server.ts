// src/routes/premierLeaguePickem/api/table/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    const { order } = await request.json();
    if (!Array.isArray(order) || order.length !== 20) {
        return json({ ok: false, error: 'Send all 20 teams in order.' }, { status: 400 });
    }
    // TODO: once the season starts, reject edits (lock the table prediction).
    await sql`insert into table_predictions (user_id, team_order)
              values (${locals.user.id}, ${sql.json(order)})
              on conflict (user_id) do update set team_order = excluded.team_order, updated_at = now()`;
    return json({ ok: true });
};