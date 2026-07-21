// src/routes/premierLeaguePickem/api/cron/+server.ts
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { resultsSyncIfDue, sendPickRemindersIfDue } from '$lib/server/sync';
import type { RequestHandler } from './$types';

// Hit this on a schedule (e.g. GitHub Actions every 15 min) with ?key=<SYNC_SECRET>.
// It self-gates: results sync only fires 135 min after a kickoff wave, and pick
// reminders only fire once, on Wednesday, per matchweek.
export const POST: RequestHandler = async ({ url, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin');
    const results = await resultsSyncIfDue();
    const reminders = await sendPickRemindersIfDue();
    return json({ ok: true, results, reminders });
};