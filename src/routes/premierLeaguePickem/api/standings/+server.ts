// src/routes/premierLeaguePickem/api/standings/+server.ts
import { json } from '@sveltejs/kit';
import { getStandings } from '$lib/server/football';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    return json(await getStandings());
};
