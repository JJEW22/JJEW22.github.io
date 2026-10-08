// src/routes/krillion/api/admin/rescore/+server.ts
// Re-run the scoring model on stored days from their saved counts (no request
// to krillion.io), rescoring every dive submitted on them. For when the model
// changes. krillion:admin, or the cron's x-sync-key.
//   POST { "day": 81 }    one day, against the stored all-time breadth range
//   POST { "all": true }  rebuild the range from every stored day, then rescore all
//   POST { "dives": true } leave the model and answer points alone; just re-run
//                          every stored dive against them (to fill in fields a
//                          newer scoreRounds adds, like the rarity percentile)
import { json } from '@sveltejs/kit';
import { dateForDay } from '$lib/krillion';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import {
	KRILLION_ADMIN_ROLE,
	KrillionError,
	rebuildBreadthRange,
	rescoreDate,
	rescoreStoredDay
} from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, KRILLION_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	try {
		if (body?.dives === true) {
			const days = await sql<{ date: string }[]>`
				select to_char(date, 'YYYY-MM-DD') as date from krillion_days order by date
			`;
			const done = [];
			for (const d of days) done.push({ date: d.date, dives: await rescoreDate(d.date) });
			return json({ ok: true, days: done });
		}
		if (body?.all === true) {
			const range = await rebuildBreadthRange();
			const days = await sql<{ date: string }[]>`
				select to_char(date, 'YYYY-MM-DD') as date from krillion_days order by date
			`;
			const done = [];
			for (const d of days) done.push(await rescoreStoredDay(d.date));
			return json({ ok: true, range, days: done });
		}
		const n = Number(body?.day);
		if (!Number.isInteger(n) || n <= 0) {
			return json(
				{ ok: false, error: 'Send { "day": <dive number> } or { "all": true }.' },
				{ status: 400 }
			);
		}
		return json({ ok: true, ...(await rescoreStoredDay(dateForDay(n))) });
	} catch (err) {
		if (err instanceof KrillionError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
};
