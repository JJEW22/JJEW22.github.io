// src/routes/premierLeaguePickem/api/cron/+server.ts
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { resultsSyncIfDue, sendPickRemindersIfDue } from '$lib/server/sync';
import type { RequestHandler } from './$types';

// Hit this on a schedule (e.g. GitHub Actions every 15 min) with an
// `x-sync-key: <SYNC_SECRET>` header. It self-gates: results sync only fires 135 min
// after a kickoff wave, and pick reminders only fire once, on Wednesday, per matchweek.
export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);
    const results = await resultsSyncIfDue();
    const reminders = await sendPickRemindersIfDue();
    return json({ ok: true, results, reminders });
};