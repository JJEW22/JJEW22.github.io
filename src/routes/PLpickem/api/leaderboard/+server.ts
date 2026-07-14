import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Match scoring is provisional: correct winner = 1, wrong = 0, and a real DRAW
// scores 0 for everyone (nobody could pick it). Adjust once you finalize rules.
// Table-prediction scoring is left as a TODO until you settle its formula.
export const GET: RequestHandler = async () => {
    const rows = await sql`
        select u.username as player,
               coalesce(sum(case
                   when mp.pick = 'HOME' and r.winner = 'HOME_TEAM' then 1
                   when mp.pick = 'AWAY' and r.winner = 'AWAY_TEAM' then 1
                   else 0 end), 0) as match_points
        from users u
        left join match_picks mp on mp.user_id = u.id
        left join results r on r.fixture_id = mp.fixture_id
        group by u.username
        order by match_points desc`;
    return json(
        rows.map((r) => ({ player: r.player as string, matchPoints: Number(r.match_points), tablePoints: 0 }))
    );
};
