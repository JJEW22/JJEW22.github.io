// src/routes/premierLeaguePickem/api/admin/sync-odds/+server.ts
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { syncOdds } from '$lib/server/sync';
import type { RequestHandler } from './$types';

// Captures probabilities + multipliers onto upcoming fixtures. The job itself lives
// in $lib/server/sync so the Admin button and the cron tick run the same code — and
// so the freeze rule (odds stop moving when picks lock) is stated in exactly one place.
export const POST: RequestHandler = async ({ url, request, locals }) => {
    // `request.headers` so the odds workflow can authenticate with an x-sync-key
    // header instead of putting SYNC_SECRET in a query string.
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);
    return json({ ok: true, ...(await syncOdds()) });
};
