// src/routes/snow/api/predict/+server.ts
// Your own prediction. Requires a login — there is no anonymous entry, because
// an entry has to belong to someone for "only your own is visible" to mean
// anything.
import { json } from '@sveltejs/kit';
import { checkPrediction } from '$lib/snow';
import { SnowError, deleteOwn, loadState, submitOwn } from '$lib/server/snow';
import type { RequestHandler } from './$types';

export const prerender = false;

function fail(err: unknown): Response {
	if (err instanceof SnowError) {
		return json({ ok: false, error: err.message }, { status: err.status });
	}
	throw err;
}

// The whole redacted state comes back on every write, so the page never has to
// work out for itself what it is now allowed to see.
async function statePayload(locals: App.Locals, slug: string): Promise<Response> {
	const state = await loadState(locals.user, slug);
	return json({ ok: true, ...state }, { headers: { 'cache-control': 'no-store' } });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ ok: false, error: 'Sign in to make a prediction.' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const slug = typeof body?.season === 'string' ? body.season : '';
	if (!slug) return json({ ok: false, error: 'Which season?' }, { status: 400 });

	// An empty display name falls back to the username, so the common case is
	// just picking a date.
	const checked = checkPrediction(body?.name || locals.user.username, body?.date);
	if (!checked.ok) return json({ ok: false, error: checked.error }, { status: 400 });

	try {
		await submitOwn(locals.user, slug, checked.value.name, checked.value.date);
	} catch (err) {
		return fail(err);
	}
	return statePayload(locals, slug);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const slug = typeof body?.season === 'string' ? body.season : '';
	if (!slug) return json({ ok: false, error: 'Which season?' }, { status: 400 });

	try {
		await deleteOwn(locals.user, slug);
	} catch (err) {
		return fail(err);
	}
	return statePayload(locals, slug);
};
