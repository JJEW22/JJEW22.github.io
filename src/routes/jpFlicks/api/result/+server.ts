// src/routes/jpFlicks/api/result/+server.ts
// Entering a score, and agreeing to one.
//
// POST   submit a result       (a player's is pending; an admin's is final)
// PATCH  { action: approve | reject }
// DELETE clear a result back to unplayed (admin only)
//
// There is no requireAdmin() on POST/PATCH: the role is not the test. Who may
// act depends on which teams the signed-in user plays for and which side
// entered the score, all decided by the predicates in $lib/jpFlicks so the page
// and the endpoint cannot disagree about who sees a button.
import { json } from '@sveltejs/kit';
import { checkResult } from '$lib/jpFlicks';
import {
	FlicksError,
	approveResult,
	clearResult,
	loadState,
	rejectResult,
	submitResult
} from '$lib/server/jpFlicks';
import type { RequestHandler } from './$types';

export const prerender = false;

function fail(err: unknown): Response {
	if (err instanceof FlicksError) {
		return json({ ok: false, error: err.message }, { status: err.status });
	}
	throw err;
}

// Every write answers with the whole season. One result changes the standings,
// the rankings and which buttons the viewer should now see, so there is no
// small correct answer here.
async function statePayload(locals: App.Locals, slug: string): Promise<Response> {
	const state = await loadState(locals.user, slug);
	return json({ ok: true, ...state }, { headers: { 'cache-control': 'no-store' } });
}

function args(body: unknown): { slug: string; matchId: number } {
	const b = (body ?? {}) as Record<string, unknown>;
	const slug = typeof b.season === 'string' ? b.season : '';
	const matchId = Number(b.matchId);
	if (!slug) throw new FlicksError('Which season?');
	if (!Number.isInteger(matchId) || matchId <= 0) {
		throw new FlicksError(`"${b.matchId}" is not a match id.`);
	}
	return { slug, matchId };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	const body = await request.json().catch(() => null);

	try {
		const { slug, matchId } = args(body);
		const state = await loadState(locals.user, slug);
		const match = state.matches.find((m) => m.id === matchId);
		if (!match) throw new FlicksError(`No match ${matchId} in ${slug}.`, 404);

		const checked = checkResult({
			kind: body?.kind,
			margin: body?.margin,
			winner: body?.winner,
			forfeitBy: body?.forfeitBy,
			teamA: match.teamA,
			teamB: match.teamB
		});
		if (!checked.ok) return json({ ok: false, error: checked.error }, { status: 400 });

		await submitResult(locals.user, slug, matchId, checked.value);
		return statePayload(locals, slug);
	} catch (err) {
		return fail(err);
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	const body = await request.json().catch(() => null);

	try {
		const { slug, matchId } = args(body);
		if (body?.action === 'approve') await approveResult(locals.user, slug, matchId);
		else if (body?.action === 'reject') await rejectResult(locals.user, slug, matchId);
		else throw new FlicksError('action must be "approve" or "reject".');
		return statePayload(locals, slug);
	} catch (err) {
		return fail(err);
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	const body = await request.json().catch(() => null);

	try {
		const { slug, matchId } = args(body);
		await clearResult(locals.user, slug, matchId);
		return statePayload(locals, slug);
	} catch (err) {
		return fail(err);
	}
};
