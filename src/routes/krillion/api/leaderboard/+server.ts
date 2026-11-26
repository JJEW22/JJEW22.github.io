// src/routes/krillion/api/leaderboard/+server.ts
// One day's board (guests included), the all-time averages (accounts only) and
// the all-time rarest answers. The day and all-time boards are totals only;
// the rarest answers do show answers, but only from dives whose submissions
// have closed, so nothing here spoils a dive that's still open. `?mine=12,15`
// lists dives this browser submitted as a guest, so those rows are marked as
// the viewer's.
import { json } from '@sveltejs/kit';
import { dateForDay, openDiveDate } from '$lib/krillion';
import {
	leaderboardAllTime,
	leaderboardForDate,
	listScoredDays,
	rarestAnswers,
	rarestRounds
} from '$lib/server/krillion';
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
	const [day, rare, days] = await Promise.all([
		leaderboardForDate(date, viewer, mine),
		rarestRounds(),
		listScoredDays()
	]);
	const allTime = await leaderboardAllTime(viewer, rare);
	return json(
		{
			ok: true,
			date,
			today: openDiveDate(),
			day,
			allTime,
			rarest: rarestAnswers(rare, viewer),
			days
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
