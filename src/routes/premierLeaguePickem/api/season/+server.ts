// src/routes/premierLeaguePickem/api/season/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { teamById } from '$lib/plTeams';
import { deadlinePassed } from '$lib/season';
import type { RequestHandler } from './$types';

// One combined save for the season predictions (fan team + full table order).
// Lock rule: freely editable until the deadline; after the deadline, locked if a
// save already exists; if none, the FIRST save locks permanently. Benefits
// (table points, 1/2-tie, +5 fan base) only apply once a save exists.
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });
    const { fanTeam, tableOrder } = await request.json();

    if (!fanTeam || !teamById[fanTeam]) {
        return json({ ok: false, error: 'Pick your fan team.' }, { status: 400 });
    }
    if (!Array.isArray(tableOrder) || tableOrder.length !== 20 || new Set(tableOrder).size !== 20) {
        return json({ ok: false, error: 'Order all 20 teams.' }, { status: 400 });
    }
    for (const id of tableOrder) if (!teamById[id]) return json({ ok: false, error: 'Unknown team in order.' }, { status: 400 });

    const existing = (await sql`select predictions_saved_at from users where id = ${locals.user.id}`)[0];
    const hasSaved = existing?.predictions_saved_at != null;
    if (hasSaved && deadlinePassed()) {
        return json({ ok: false, error: 'Your season predictions are locked.' }, { status: 409 });
    }

    await sql.begin(async (tx) => {
        await tx`update users
                 set fan_team = ${fanTeam},
                     predictions_saved_at = coalesce(predictions_saved_at, now())
                 where id = ${locals.user!.id}`;
        await tx`insert into table_predictions (user_id, team_order)
                 values (${locals.user!.id}, ${tx.json(tableOrder)})
                 on conflict (user_id) do update set team_order = excluded.team_order, updated_at = now()`;
    });

    // After this save a record exists, so locked iff the deadline has passed.
    return json({ ok: true, locked: deadlinePassed() });
};