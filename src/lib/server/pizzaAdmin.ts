// src/lib/server/pizzaAdmin.ts
// Shared bits of the /pizzaBracket/admin endpoints.

import { error, json } from '@sveltejs/kit';
import { loadBracket, toAdminJson, type LoadedBracket } from '$lib/server/pizzaBracket';

// site:admin implies this one, via hasRole().
export const PIZZA_ADMIN_ROLE = 'pizza:admin';

export async function requireBracket(slug?: string): Promise<LoadedBracket> {
	const bracket = await loadBracket(slug);
	if (!bracket) {
		throw error(404, 'No pizza bracket found. Run scripts/importPizzaBracket.mjs first.');
	}
	return bracket;
}

// Every write replies with the whole recomputed state rather than an acknowledgement.
// One rating can flip a winner, and that winner can fill a slot two rounds up, so
// there is no small correct answer here and the page should never have to guess.
export async function statePayload(slug?: string) {
	return { ok: true as const, state: toAdminJson(await requireBracket(slug)) };
}

export async function stateResponse(slug?: string): Promise<Response> {
	return json(await statePayload(slug));
}

export function badRequest(message: string): Response {
	return json({ ok: false, error: message }, { status: 400 });
}

// postgres.js surfaces a unique-violation as SQLSTATE 23505. The only unique
// constraints an admin can trip are the name ones, and "already taken" is a far
// better answer than a 500.
export function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
