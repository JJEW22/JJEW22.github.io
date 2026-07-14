import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Restores the logged-in user and pre-fills their saved picks on page load.
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ user: null });
    const picks = await sql`select fixture_id, pick from match_picks where user_id = ${locals.user.id}`;
    const matchPicks = Object.fromEntries(picks.map((p) => [p.fixture_id, p.pick]));
    const tp = (await sql`select team_order from table_predictions where user_id = ${locals.user.id}`)[0];
    return json({ user: locals.user.username, matchPicks, tableOrder: tp?.team_order ?? null });
};
