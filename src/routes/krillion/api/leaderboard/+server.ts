// src/routes/krillion/api/leaderboard/+server.ts
// Signed-in players' totals: one day's board, and the all-time averages.
// Totals only, never answers, so it's safe to show while the day is running.
import { json } from '@sveltejs/kit';
import { dateForDay, etDate } from '$lib/krillion';
import { leaderboardAllTime, leaderboardForDate, listScoredDays } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	const n = Number(url.searchParams.get('day'));
	const date = Number.isInteger(n) && n > 0 ? dateForDay(n) : etDate();
	const viewer = locals.user?.id ?? null;
	const [day, allTime, days] = await Promise.all([
		leaderboardForDate(date, viewer),
		leaderboardAllTime(viewer),
		listScoredDays()
	]);
	return json(
		{ ok: true, date, today: etDate(), day, allTime, days },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
