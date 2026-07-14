import { json } from '@sveltejs/kit';
import { getFixtures } from '$lib/server/football';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const mw = Number(url.searchParams.get('mw')) || 1;
    const fixtures = await getFixtures(mw);
    return json({
        number: mw,
        fixtures: fixtures.map((f) => ({
            id: f.id,
            homeId: f.homeId,
            awayId: f.awayId,
            homeName: f.homeName,
            awayName: f.awayName,
            kickoff: f.kickoff
        }))
    });
};
