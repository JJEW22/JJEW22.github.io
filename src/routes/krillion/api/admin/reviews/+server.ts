// src/routes/krillion/api/admin/reviews/+server.ts
// Words players sent for review -- answers not on the day's list. An accepted
// word scores its prompt's target mean + 1 SD for everyone who gave it, and
// that day's dives are rescored straight away. krillion:admin (or site:admin)
// only; today's words only once the admin has submitted today's dive.
//   GET                                      the queue and recent decisions
//   POST { id, status: 'accepted' | 'rejected' | 'pending' }
import { json } from '@sveltejs/kit';
import { hasRole } from '$lib/server/roles';
import {
	KRILLION_ADMIN_ROLE,
	KrillionError,
	decideReview,
	listReviews,
	type ReviewStatus
} from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };
const STATUSES: ReviewStatus[] = ['accepted', 'rejected', 'pending'];

function gate(locals: App.Locals): Response | null {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	if (!hasRole(locals.user, KRILLION_ADMIN_ROLE)) {
		return json({ ok: false, error: 'This page needs the krillion:admin role.' }, { status: 403 });
	}
	return null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = gate(locals);
	if (denied) return denied;
	return json({ ok: true, ...(await listReviews(locals.user!.id)) }, { headers: NO_STORE });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = gate(locals);
	if (denied) return denied;
	const body = await request.json().catch(() => null);
	const id = Number(body?.id);
	const status = body?.status as ReviewStatus;
	if (!Number.isInteger(id) || !STATUSES.includes(status)) {
		return json(
			{ ok: false, error: "Send { id, status: 'accepted' | 'rejected' | 'pending' }." },
			{ status: 400 }
		);
	}
	try {
		const done = await decideReview(locals.user!.id, id, status);
		return json(
			{ ok: true, ...done, ...(await listReviews(locals.user!.id)) },
			{ headers: NO_STORE }
		);
	} catch (err) {
		if (err instanceof KrillionError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
};
