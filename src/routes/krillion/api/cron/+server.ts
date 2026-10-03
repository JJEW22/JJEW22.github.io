// src/routes/krillion/api/cron/+server.ts
// Hit hourly by .github/workflows/krillion-cron.yml with `x-sync-key: <SYNC_SECRET>`.
// Both jobs self-gate, so the extra ticks cost nothing:
//   - the day's one fetch from krillion.io: first tick at/after 11am ET
//   - final-score emails: first tick after midnight ET, for the day just ended
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { fetchIfDue, sendFinalEmailsIfDue } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, 'krillion:admin', request.headers);
	const fetched = await fetchIfDue().catch((err) => ({
		fetched: false,
		error: String(err?.message ?? err)
	}));
	const emails = await sendFinalEmailsIfDue();
	return json({ ok: true, fetched, emails });
};
