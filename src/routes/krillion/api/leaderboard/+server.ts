// src/routes/krillion/api/leaderboard/+server.ts
// One day's board (guests included) and the all-time averages (accounts
// only). Totals only, never answers, so it's safe to show while the day is
// running. `?mine=12,15` lists dives this browser submitted as a guest, so
// those rows are marked as the viewer's.
import { json } from '@sveltejs/kit';
import { dateForDay, openDiveDate } from '$lib/krillion';
import { leaderboardAllTime, leaderboardForDate, listScoredDays } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	const n = Number(url.searchParams.get('day'));
	const date = Number.isInteger(n) && n > 0 ? dateForDay(n) : openDiveDate();
	const viewer = locals.user?.id ?? null;
	const mine = (url.searchParams.get('mine') ?? '')
		.split(',')
		.map(Number)
		.filter((id) => Number.isInteger(id) && id > 0)
		.slice(0, 50);
	const [day, allTime, days] = await Promise.all([
		leaderboardForDate(date, viewer, mine),
		leaderboardAllTime(viewer),
		listScoredDays()
	]);
	return json(
		{ ok: true, date, today: openDiveDate(), day, allTime, days },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
