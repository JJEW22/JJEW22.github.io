// src/routes/premierLeaguePickem/api/leaderboard/+server.ts
import { json } from '@sveltejs/kit';
import { computeLeaderboard } from '$lib/server/scoring';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    return json(await computeLeaderboard());
};
