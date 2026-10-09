// src/routes/krillion/api/submit/+server.ts
// Submit a dive: the seven answers the player reviewed on the page -- filled in
// from their pasted end screen where the paste covered a round, typed where it
// didn't. A blank answer is a miss. Game points for a matched answer always
// come from the day's answer sheet, so nothing pasted is trusted for scoring.
//
// Once the day's list is in, an answer that isn't on it is refused (422, with
// `unknownRounds`): the page moves it to an override. An override is another
// word for the round, filed for a krillion admin; the round keeps scoring its
// answer until the override is accepted.
import { json } from '@sveltejs/kit';
import { dayForDate, etDate, type PastedRound } from '$lib/krillion';
import { KrillionError, submitDive } from '$lib/server/krillion';
import type { RequestHandler } from './$types';

export const prerender = false;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}
	if (!Array.isArray(body.rounds) || body.rounds.length !== 7) {
		return json({ ok: false, error: 'A dive has 7 rounds.' }, { status: 400 });
	}

	const rounds: PastedRound[] = body.rounds.map((r: Record<string, unknown> | null, i: number) => {
		const answer = text(r?.answer, 200);
		return {
			round: i + 1,
			prompt: text(r?.prompt, 300),
			answer: answer || null,
			typed: text(r?.typed, 200) || null,
			miss: !answer,
			othersChose: num(r?.othersChose),
			gamePoints: num(r?.gamePoints),
			found: Boolean(r?.found),
			// An override: another word, not on the day's list, for review.
			override: text(r?.override, 200) || null
		};
	});
	if (rounds.every((r) => r.miss)) {
		return json({ ok: false, error: 'Enter at least one answer.' }, { status: 400 });
	}

	// No "Dive #N complete" in a partial paste, and none when typed: today's dive.
	const n = num(body.dayNumber);
	const dayNumber = n !== null && Number.isInteger(n) && n > 0 ? n : dayForDate(etDate());

	try {
		const result = await submitDive(locals.user?.id ?? null, {
			dayNumber,
			rounds,
			gameScore: num(body.gameScore),
			betterThan: num(body.betterThan),
			email: typeof body.email === 'string' ? body.email : null,
			notify: Boolean(body.notify)
		});
		return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
	} catch (err) {
		if (err instanceof KrillionError) {
			return json({ ok: false, error: err.message, ...err.details }, { status: err.status });
		}
		throw err;
	}
};
