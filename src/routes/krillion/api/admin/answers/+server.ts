// src/routes/krillion/api/admin/answers/+server.ts
// Every answer's count, game points and rescored points for one day, per
// prompt, plus every dive submitted that day with its per-round conversion.
// krillion:admin (or site:admin) only, and today's only once the admin has
// submitted their own dive -- enforced in assertAdminCanSee().
import { json } from '@sveltejs/kit';
import { dateForDay, etDate } from '$lib/krillion';
import { hasRole } from '$lib/server/roles';
import {
	KRILLION_ADMIN_ROLE,
	KrillionError,
	adminAnswers,
	adminSubmissions,
	getBreadthRange,
	listScoredDays
} from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	if (!hasRole(locals.user, KRILLION_ADMIN_ROLE)) {
		return json({ ok: false, error: 'This page needs the krillion:admin role.' }, { status: 403 });
	}
	const n = Number(url.searchParams.get('day'));
	const date = Number.isInteger(n) && n > 0 ? dateForDay(n) : etDate();
	const days = await listScoredDays();
	try {
		const submissions = await adminSubmissions(locals.user.id, date);
		let data;
		try {
			data = await adminAnswers(locals.user.id, date);
		} catch (err) {
			// No counts yet (before 11am): the dives are still worth seeing.
			if (err instanceof KrillionError && err.status === 404) {
				return json(
					{ ok: false, error: err.message, today: etDate(), days, date, submissions },
					{ status: 404, headers: { 'cache-control': 'private, no-store' } }
				);
			}
			throw err;
		}
		const range = await getBreadthRange();
		return json(
			{ ok: true, today: etDate(), days, range, submissions, ...data },
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (err) {
		if (err instanceof KrillionError) {
			return json(
				{ ok: false, error: err.message, gated: err.status === 403, today: etDate(), days, date },
				{ status: err.status }
			);
		}
		throw err;
	}
};
