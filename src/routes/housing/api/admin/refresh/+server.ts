// src/routes/housing/api/admin/refresh/+server.ts
// Re-pull the housing data now. The page's "Refresh" button and the weekly
// workflow (.github/workflows/housing-refresh.yml) both land here; the
// workflow authenticates with SYNC_SECRET, the button with the session.
//
// Body (optional): { "sources": ["fred"] } to refresh only some sources.
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import { HOUSING_ADMIN_ROLE, SOURCES, refresh, type Source } from '$lib/server/housing';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const asked: unknown[] = Array.isArray(body?.sources) ? body.sources : SOURCES;
	const sources = SOURCES.filter((s) => asked.includes(s));
	if (!sources.length) {
		return json(
			{ ok: false, error: `sources must be any of: ${SOURCES.join(', ')}` },
			{ status: 400 }
		);
	}

	const results = await refresh(sources as Source[]);
	return json(
		{ ok: results.every((r) => r.ok), results },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
