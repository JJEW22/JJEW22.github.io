// src/routes/pizzaBracket/api/bracket/+server.ts
// The public bracket, in the exact shape PizzaBracket.svelte already renders.
import { json } from '@sveltejs/kit';
import { loadBracket, toBracketJson } from '$lib/server/pizzaBracket';
import type { RequestHandler } from './$types';

// The root layout sets prerender = true for the whole app. Nothing crawls this
// endpoint, so it is never picked up in practice — but a prerendered copy of a live
// bracket would freeze at build time and look merely stale rather than broken, so
// say it outright.
export const prerender = false;

export const GET: RequestHandler = async ({ url }) => {
	const slug = url.searchParams.get('slug') ?? undefined;
	const bracket = await loadBracket(slug);
	if (!bracket) return json({ ok: false, error: 'No bracket found.' }, { status: 404 });
	return json(toBracketJson(bracket));
};
