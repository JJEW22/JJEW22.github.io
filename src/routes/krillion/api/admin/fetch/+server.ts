// src/routes/krillion/api/admin/fetch/+server.ts
// "Fetch now": today's counts and answer sheet from krillion.io immediately,
// whatever the time (before 11am too), rescoring every dive submitted today.
// It doesn't count as the scheduled fetch, so the 11am cron still runs.
// krillion:admin (or site:admin) only.
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import { KRILLION_ADMIN_ROLE, KrillionError, forceFetch } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	if (!hasRole(locals.user, KRILLION_ADMIN_ROLE)) {
		return json({ ok: false, error: 'This needs the krillion:admin role.' }, { status: 403 });
	}
	try {
		return json({ ok: true, ...(await forceFetch()) });
	} catch (err) {
		if (err instanceof KrillionError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
};
