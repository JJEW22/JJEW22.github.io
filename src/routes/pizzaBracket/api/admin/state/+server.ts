// src/routes/pizzaBracket/api/admin/state/+server.ts
// Everything the admin grid renders, in one request.
import { requireAdmin } from '$lib/server/roles';
import { PIZZA_ADMIN_ROLE, stateResponse } from '$lib/server/pizzaAdmin';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, PIZZA_ADMIN_ROLE, request.headers);
	return stateResponse(url.searchParams.get('slug') ?? undefined);
};
