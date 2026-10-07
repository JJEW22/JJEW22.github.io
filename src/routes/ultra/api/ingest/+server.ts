// src/routes/ultra/api/ingest/+server.ts
// Where the Overland iOS app posts GPS batches:
//   { "locations": [GeoJSON Point features], "current": ..., "trip": ... }
// Overland only deletes a batch from the phone once it gets {"result":"ok"},
// so anything that fails here is simply resent later.
import { json } from '@sveltejs/kit';
import { ingestAuthorized, ingestLocations } from '$lib/server/ultra';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, url }) => {
	if (!ingestAuthorized(request, url)) {
		return json({ result: 'error', error: 'bad token' }, { status: 401 });
	}
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ result: 'error', error: 'expected JSON' }, { status: 400 });
	}
	const saved = await ingestLocations((body as { locations?: unknown }).locations);
	return json({ result: 'ok', saved });
};
