// src/routes/snow/api/predict/+server.ts
// Your own prediction. Requires a login — there is no anonymous entry, because
// an entry has to belong to someone for "only your own is visible" to mean
// anything.
import { json } from '@sveltejs/kit';
import { checkPrediction } from '$lib/snow';
import { SnowError, deleteOwn, loadState, submitOwn } from '$lib/server/snow';
import { AccountNameError, getAccountName, setAccountName } from '$lib/server/accountNames';
import type { RequestHandler } from './$types';

export const prerender = false;

function fail(err: unknown): Response {
	if (err instanceof SnowError || err instanceof AccountNameError) {
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

	// Your prediction always shows your account's name. A name sent with the
	// pick becomes the account's name; without one, the account's existing name
	// is used, and the username only if the account has none yet.
	const accountName = await getAccountName(locals.user.id);
	const checked = checkPrediction(body?.name || accountName || locals.user.username, body?.date);
	if (!checked.ok) return json({ ok: false, error: checked.error }, { status: 400 });

	try {
		await submitOwn(locals.user, slug, checked.value.name, checked.value.date);
		if (checked.value.name !== accountName)
			await setAccountName(locals.user.id, checked.value.name);
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
