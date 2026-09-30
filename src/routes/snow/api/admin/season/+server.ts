// src/routes/snow/api/admin/season/+server.ts
// Creating a season, moving its deadline, and recording the snow.
//
// Unlike the prediction endpoints this one keeps working after a season locks,
// on purpose: extending a deadline and entering the first-snow date are exactly
// the things needed once it has, and an extended deadline is the only way to
// reopen a season whose predictions need fixing.
import { json } from '@sveltejs/kit';
import { isDay } from '$lib/snow';
import { requireAdmin } from '$lib/server/roles';
import { SNOW_ADMIN_ROLE, loadState, saveSeason } from '$lib/server/snow';
import type { RequestHandler } from './$types';

export const prerender = false;

const SLUG_RE = /^[a-z0-9-]{3,20}$/;

function day(value: unknown, field: string): string | null {
	const s = typeof value === 'string' ? value.trim() : '';
	if (!s) return null;
	if (!isDay(s)) throw new Error(`${field} must be a date in YYYY-MM-DD form.`);
	return s;
}

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, SNOW_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
	const label = typeof body?.label === 'string' ? body.label.trim() : '';

	if (!SLUG_RE.test(slug)) {
		return json(
			{ ok: false, error: 'A season slug looks like "2026-27" — lowercase, digits and dashes.' },
			{ status: 400 }
		);
	}
	if (!label) return json({ ok: false, error: 'A season needs a label.' }, { status: 400 });

	let deadline: string | null;
	let firstSnow: string | null;
	try {
		deadline = day(body?.deadline, 'The deadline');
		firstSnow = day(body?.firstSnow, 'The first-snow date');
	} catch (err) {
		return json({ ok: false, error: (err as Error).message }, { status: 400 });
	}

	await saveSeason({ slug, label, deadline, firstSnow, isCurrent: Boolean(body?.isCurrent) });

	const state = await loadState(locals.user, slug);
	return json({ ok: true, ...state }, { headers: { 'cache-control': 'no-store' } });
};
