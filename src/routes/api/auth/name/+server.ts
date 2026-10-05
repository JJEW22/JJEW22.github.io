// src/routes/api/auth/name/+server.ts
// Set your own name: the person behind the account, site-wide, separate from
// your username. Used on /account and by any feature that shows names (Snow
// Predictions). A site:admin can override it on /admin.
import { json } from '@sveltejs/kit';
import { checkName } from '$lib/names';
import { AccountNameError, setAccountName } from '$lib/server/accountNames';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	const body = await request.json().catch(() => null);
	const checked = checkName(body?.name);
	if (!checked.ok) return json({ ok: false, error: checked.error }, { status: 400 });
	try {
		await setAccountName(locals.user.id, checked.value);
	} catch (err) {
		if (err instanceof AccountNameError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
	return json({ ok: true, name: checked.value });
};
