// src/routes/premierLeaguePickem/api/cron/+server.ts
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { oddsSyncIfDue, resultsSyncIfDue, sendPickRemindersIfDue } from '$lib/server/sync';
import type { RequestHandler } from './$types';

// Hit this on a schedule (e.g. GitHub Actions every 15 min) with an
// `x-sync-key: <SYNC_SECRET>` header. Every job self-gates: odds refresh twice a day
// (the odds API is a 500-a-month plan), results sync fires 135 min after a kickoff
// wave, and pick reminders fire once per matchweek, 24h before its first kickoff.
export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'pickem:admin', request.headers);
    const odds = await oddsSyncIfDue();
    const results = await resultsSyncIfDue();
    const reminders = await sendPickRemindersIfDue();
    return json({ ok: true, odds, results, reminders });
};