// src/routes/krillion/api/submit/+server.ts
// Submit a dive: either the pasted end screen (parsed here too, so the server
// never trusts the page's reading of it) or seven typed answers.
import { json } from '@sveltejs/kit';
import { etDate, dayForDate, parsePaste, type PastedRound } from '$lib/krillion';
import { KrillionError, submitDive } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

const MAX_PASTE = 20_000;

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object')
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });

	let dayNumber: number;
	let rounds: PastedRound[];
	let gameScore: number | null = null;
	let betterThan: number | null = null;

	if (typeof body.paste === 'string') {
		if (body.paste.length > MAX_PASTE)
			return json({ ok: false, error: 'That paste is too long.' }, { status: 400 });
		const dive = parsePaste(body.paste);
		if (!dive.complete || dive.dayNumber === null) {
			return json(
				{
					ok: false,
					error:
						"Couldn't find all 7 rounds in that paste. Copy the whole end screen and try again."
				},
				{ status: 400 }
			);
		}
		dayNumber = dive.dayNumber;
		rounds = dive.rounds;
		gameScore = dive.score;
		betterThan = dive.betterThan;
	} else if (Array.isArray(body.answers) && body.answers.length === 7) {
		// Typed in: today's dive, round order = prompt order.
		dayNumber = dayForDate(etDate());
		rounds = body.answers.map((a: unknown, i: number) => {
			const text = typeof a === 'string' ? a.trim() : '';
			return {
				round: i + 1,
				prompt: '',
				answer: text || null,
				typed: null,
				miss: !text,
				othersChose: null,
				gamePoints: null
			};
		});
	} else {
		return json(
			{ ok: false, error: 'Paste your end screen, or type all 7 answers.' },
			{ status: 400 }
		);
	}

	try {
		const result = await submitDive(locals.user?.id ?? null, {
			dayNumber,
			rounds,
			gameScore,
			betterThan,
			email: typeof body.email === 'string' ? body.email : null,
			notify: Boolean(body.notify)
		});
		return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
	} catch (err) {
		if (err instanceof KrillionError)
			return json({ ok: false, error: err.message }, { status: err.status });
		throw err;
	}
};
