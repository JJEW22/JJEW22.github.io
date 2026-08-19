// src/routes/premierLeaguePickem/api/admin/reveal-tables/+server.ts
// Admin switch for publishing everyone's predicted final tables to the rest of
// the competition. Reversible — POST { enabled: false } hides them again.
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { getFlag, setFlag, REVEAL_TABLES_KEY } from '$lib/server/appMeta';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);
    return json({ ok: true, enabled: await getFlag(REVEAL_TABLES_KEY) });
};

export const POST: RequestHandler = async ({ request, url, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);
    const { enabled } = await request.json();
    if (typeof enabled !== 'boolean') {
        return json({ ok: false, error: 'Send { enabled: true | false }.' }, { status: 400 });
    }
    await setFlag(REVEAL_TABLES_KEY, enabled);
    return json({ ok: true, enabled });
};
