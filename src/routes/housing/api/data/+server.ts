// src/routes/housing/api/data/+server.ts
// Everything /housing renders for one region. Admin-only, like the page: the
// page is prerendered and shows a denied state on its own, so this is what
// actually keeps the data private.
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { HOUSING_ADMIN_ROLE, loadData } from '$lib/server/housing';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const region = url.searchParams.get('region') ?? undefined;
	const data = await loadData(region);
	return json({ ok: true, ...data }, { headers: { 'cache-control': 'no-store' } });
};
