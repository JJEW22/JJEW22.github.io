// src/routes/snow/api/admin/prediction/+server.ts
// Entering and amending other people's predictions.
//
// Note there is no requireAdmin() here: the role alone is not enough. An admin
// who has not yet submitted their own pick is refused, and so is one trying to
// touch their own row, both enforced in $lib/server/snow. The x-sync-key path
// requireAdmin offers is wrong for this endpoint anyway — no cron should be
// entering predictions.
import { json } from '@sveltejs/kit';
import { checkPrediction } from '$lib/snow';
import { SnowError, deleteOnBehalf, loadState, upsertOnBehalf } from '$lib/server/snow';
import type { RequestHandler } from './$types';

export const prerender = false;

function fail(err: unknown): Response {
	if (err instanceof SnowError) {
		return json({ ok: false, error: err.message }, { status: err.status });
	}
	throw err;
}

async function statePayload(locals: App.Locals, slug: string): Promise<Response> {
	const state = await loadState(locals.user, slug);
	return json({ ok: true, ...state }, { headers: { 'cache-control': 'no-store' } });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const slug = typeof body?.season === 'string' ? body.season : '';
	if (!slug) return json({ ok: false, error: 'Which season?' }, { status: 400 });

	const checked = checkPrediction(body?.name, body?.date);
	if (!checked.ok) return json({ ok: false, error: checked.error }, { status: 400 });

	const id =
		body?.id === undefined || body?.id === null || body?.id === '' ? null : Number(body.id);
	if (id !== null && (!Number.isInteger(id) || id <= 0)) {
		return json({ ok: false, error: `"${body.id}" is not a prediction id.` }, { status: 400 });
	}

	const rawUser = body?.userId;
	const userId =
		rawUser === undefined || rawUser === null || rawUser === '' ? null : Number(rawUser);
	if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
		return json({ ok: false, error: `"${rawUser}" is not an account id.` }, { status: 400 });
	}

	try {
		await upsertOnBehalf(locals.user, slug, { id, userId, ...checked.value });
	} catch (err) {
		return fail(err);
	}
	return statePayload(locals, slug);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const slug = typeof body?.season === 'string' ? body.season : '';
	const id = Number(body?.id);
	if (!slug) return json({ ok: false, error: 'Which season?' }, { status: 400 });
	if (!Number.isInteger(id) || id <= 0) {
		return json({ ok: false, error: `"${body?.id}" is not a prediction id.` }, { status: 400 });
	}

	try {
		await deleteOnBehalf(locals.user, slug, id);
	} catch (err) {
		return fail(err);
	}
	return statePayload(locals, slug);
};
