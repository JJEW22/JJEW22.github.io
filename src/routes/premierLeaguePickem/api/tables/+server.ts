// src/routes/premierLeaguePickem/api/tables/+server.ts
// Everyone's predicted final tables, for the viewer on the Season predictions tab.
// Hidden until an admin flips the reveal flag; admins can always read it, so they
// can check what the competition is about to see before publishing it.
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { hasRole } from '$lib/server/roles';
import { getFlag, REVEAL_TABLES_KEY } from '$lib/server/appMeta';
import type { RequestHandler } from './$types';

interface Row {
    id: number;
    name: string;
    fan_team: string | null;
    predictions_saved_at: Date | null;
    team_order: unknown;
}

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'Log in first.' }, { status: 401 });

    const admin = hasRole(locals.user, 'pickem:admin');
    const revealed = await getFlag(REVEAL_TABLES_KEY);

    // Same gate as the tab this viewer lives on: signed in AND in the competition.
    const me = (await sql`select pickem_joined_at from users where id = ${locals.user.id}`)[0];
    if (!me?.pickem_joined_at && !admin) {
        return json({ ok: false, error: 'Join the competition first.' }, { status: 403 });
    }
    if (!revealed && !admin) return json({ ok: true, revealed: false, players: [] });

    const rows = await sql<Row[]>`
        select u.id, coalesce(u.display_name, u.username) as name,
               u.fan_team, u.predictions_saved_at, t.team_order
        from table_predictions t join users u on u.id = t.user_id
        where u.pickem_joined_at is not null
        order by name asc`;

    // team_order arrives as a parsed array from jsonb, or as a string — the same
    // two shapes scoring.ts handles. A row that is neither is dropped below.
    const players = rows
        .map((r) => {
            let order: string[] = [];
            try {
                order = Array.isArray(r.team_order) ? (r.team_order as string[]) : JSON.parse(String(r.team_order));
            } catch (err) {
                console.error(`tables: unreadable team_order for user ${r.id}`, err);
            }
            return {
                id: r.id,
                name: r.name,
                // Matches the leaderboard: no fan team until they've saved.
                fanTeam: r.predictions_saved_at ? (r.fan_team ?? null) : null,
                saved: r.predictions_saved_at != null,
                order
            };
        })
        .filter((p) => p.order.length === 20);

    return json({ ok: true, revealed, players });
};
