// src/routes/krillion/api/day/+server.ts
// Today's status for the page: is the day's snapshot in yet, and (on request)
// the answer names for the type-it-in fallback's autocomplete.
import { json } from '@sveltejs/kit';
import { dateForDay, etDate } from '$lib/krillion';
import { loadAnswerNames, loadDay } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url }) => {
	const n = Number(url.searchParams.get('day'));
	const date = Number.isInteger(n) && n > 0 ? dateForDay(n) : etDate();
	const day = await loadDay(date);
	const answers =
		url.searchParams.get('answers') === '1' && day.scored ? await loadAnswerNames(date) : undefined;
	return json(
		{ ok: true, today: etDate(), ...day, answers },
		{ headers: { 'cache-control': 'public, max-age=60' } }
	);
};
