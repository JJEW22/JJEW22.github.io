// src/lib/server/krillion.ts
// Krillion, rescored: the daily snapshot, scoring, submissions and emails.
//
// We haven't asked Krillion's developer for permission yet, so this contacts
// krillion.io ONCE a day: the first cron tick after 11am ET fetches today's
// prompts, answer sheet and answer counts (three GETs, the same public ones the
// game itself uses). Everything a player submits is scored against that one
// snapshot. When permission arrives, loosen fetchIfDue() -- the tables and the
// rescoring already handle several snapshots a day.
//
// Not here on purpose: cheater removal, miss rates and "better than X%"
// standings. They need the score histogram, which only comes from the game's
// own "finished a game" POST, and we don't call that.

import { sql } from '$lib/server/db';
import { sendEmail } from '$lib/server/email';
import {
	dateForDay,
	dayForDate,
	etDate,
	etHour,
	matchAnswer,
	scorePrompt,
	type PastedRound,
	type PromptFit
} from '$lib/krillion';

const BASE = 'https://krillion.io';
const FETCH_HOUR_ET = 11;
const SITE = 'https://johnjackwilkins.com';
// Identify ourselves; a contact makes it easy for the developer to reach us.
const UA = `johnjackwilkins.com krillion-rescore (once daily; contact ${SITE})`;

export class KrillionError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}

// ---------------- fetching and scoring a day ----------------

interface RevealPrompt {
	id: string;
	text: string;
	answers: { answer: string; score: number }[];
}

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(BASE + path, {
		headers: { 'user-agent': UA, accept: 'application/json' },
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) throw new KrillionError(`krillion.io ${path} answered ${res.status}`, 502);
	return (await res.json()) as T;
}

export async function fetchAndScore(
	date: string
): Promise<{ date: string; answers: number; prompts: number }> {
	const today = await getJson<{
		date: string;
		dayNumber: number;
		prompts: { id: string; text: string }[];
	}>('/api/today');
	if (today.date !== date)
		throw new KrillionError(`krillion.io is on ${today.date}, not ${date}`, 409);
	const reveal = await getJson<{ date: string; prompts: RevealPrompt[] }>(
		`/api/reveal?date=${date}`
	);
	const pop = await getJson<{
		date: string;
		asOf: string;
		prompts: Record<string, Record<string, number>>;
	}>(`/api/answer-popularity?date=${date}`);

	const model: Record<string, PromptFit> = {};
	const rows: {
		date: string;
		prompt_id: string;
		answer: string;
		count: number;
		game_score: number | null;
		points: number;
	}[] = [];
	for (const p of today.prompts) {
		// Counted answers keep Krillion's spelling from the counts; sheet answers
		// nobody gave come in at 0; counted answers the sheet groups (some p7
		// birds on 2026-10-02) keep a null game score.
		const merged = new Map<string, { answer: string; count: number; gameScore: number | null }>();
		for (const [answer, count] of Object.entries(pop.prompts[p.id] ?? {})) {
			merged.set(answer.toLowerCase(), { answer, count, gameScore: null });
		}
		for (const a of reveal.prompts.find((r) => r.id === p.id)?.answers ?? []) {
			const hit = merged.get(a.answer.toLowerCase());
			if (hit) hit.gameScore = a.score;
			else merged.set(a.answer.toLowerCase(), { answer: a.answer, count: 0, gameScore: a.score });
		}
		const answers = [...merged.values()];
		if (!answers.length) continue;
		const { points, fit } = scorePrompt(answers);
		model[p.id] = fit;
		answers.forEach((a, i) =>
			rows.push({
				date,
				prompt_id: p.id,
				answer: a.answer,
				count: a.count,
				game_score: a.gameScore,
				points: points[i]
			})
		);
	}

	await sql.begin(async (tx) => {
		await tx`
			insert into krillion_days (date, day_number, prompts, fetched_at, counts_as_of, model)
			values (${date}, ${today.dayNumber}, ${tx.json(today.prompts)}, now(), ${pop.asOf}, ${tx.json(model as never)})
			on conflict (date) do update set
				day_number = excluded.day_number, prompts = excluded.prompts, fetched_at = excluded.fetched_at,
				counts_as_of = excluded.counts_as_of, model = excluded.model, updated_at = now()
		`;
		await tx`delete from krillion_answers where date = ${date}`;
		// A few thousand rows; chunked to stay well under the parameter limit.
		for (let i = 0; i < rows.length; i += 1000) {
			await tx`insert into krillion_answers ${tx(rows.slice(i, i + 1000))}`;
		}
	});
	await rescoreDate(date);
	return { date, answers: rows.length, prompts: Object.keys(model).length };
}

// ---------------- the day as the page sees it ----------------

export interface DayView {
	date: string;
	dayNumber: number;
	scored: boolean;
	fetchedAt: string | null;
	countsAsOf: string | null;
	prompts: { id: string; text: string }[];
	nextFetch: string; // human description
}

export async function loadDay(date: string): Promise<DayView> {
	const [row] = await sql<
		{
			day_number: number;
			prompts: { id: string; text: string }[];
			fetched_at: Date;
			counts_as_of: Date | null;
		}[]
	>`
		select day_number, prompts, fetched_at, counts_as_of from krillion_days where date = ${date}
	`;
	return {
		date,
		dayNumber: row?.day_number ?? dayForDate(date),
		scored: Boolean(row),
		fetchedAt: row ? row.fetched_at.toISOString() : null,
		countsAsOf: row?.counts_as_of ? new Date(row.counts_as_of).toISOString() : null,
		prompts: row?.prompts ?? [],
		nextFetch: `${FETCH_HOUR_ET}:00 ET`
	};
}

// Answer names for the type-it-in fallback's autocomplete.
export async function loadAnswerNames(date: string): Promise<Record<string, string[]>> {
	const rows = await sql<{ prompt_id: string; answer: string }[]>`
		select prompt_id, answer from krillion_answers where date = ${date}
		order by prompt_id, count desc, answer
	`;
	const out: Record<string, string[]> = {};
	for (const r of rows) (out[r.prompt_id] ??= []).push(r.answer);
	return out;
}

// ---------------- scoring submissions ----------------

interface AnswerRow {
	prompt_id: string;
	answer: string;
	count: number;
	game_score: number | null;
	points: number;
}

export interface ScoredRound {
	round: number;
	promptId: string | null;
	prompt: string;
	submitted: string | null;
	match: string | null;
	miss: boolean;
	gamePoints: number | null;
	points: number;
	count: number | null;
}

function scoreRounds(
	rounds: PastedRound[],
	prompts: { id: string; text: string }[],
	answers: AnswerRow[]
): { scored: ScoredRound[]; total: number } {
	const byPrompt = new Map<string, AnswerRow[]>();
	for (const a of answers) {
		if (!byPrompt.has(a.prompt_id)) byPrompt.set(a.prompt_id, []);
		byPrompt.get(a.prompt_id)!.push(a);
	}
	const scored = rounds.map((r, i) => {
		// The paste carries the prompt text; typed-in rounds go by round number.
		const p =
			prompts.find((x) => x.text.toLowerCase() === (r.prompt ?? '').toLowerCase()) ??
			prompts[r.round - 1] ??
			prompts[i];
		const hit = !r.miss && r.answer && p ? matchAnswer(byPrompt.get(p.id) ?? [], r.answer) : null;
		return {
			round: r.round,
			promptId: p?.id ?? null,
			prompt: p?.text ?? r.prompt,
			submitted: r.answer,
			match: hit?.answer ?? null,
			miss: r.miss || !hit,
			gamePoints: r.gamePoints ?? hit?.game_score ?? null,
			points: hit ? hit.points : 0,
			count: hit ? hit.count : null
		};
	});
	return { scored, total: scored.reduce((s, r) => s + r.points, 0) };
}

export async function rescoreDate(date: string): Promise<number> {
	const day = await loadDay(date);
	if (!day.scored) return 0;
	const answers = await sql<AnswerRow[]>`
		select prompt_id, answer, count, game_score, points from krillion_answers where date = ${date}
	`;
	const subs = await sql<{ id: string; rounds: PastedRound[] }[]>`
		select id, rounds from krillion_submissions where date = ${date}
	`;
	for (const s of subs) {
		const { scored, total } = scoreRounds(s.rounds, day.prompts, answers);
		await sql`
			update krillion_submissions
			set scored = ${sql.json(scored as never)}, updated_score = ${total}, scored_at = now()
			where id = ${s.id}
		`;
	}
	return subs.length;
}

// ---------------- submitting ----------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubmitInput {
	dayNumber: number;
	rounds: PastedRound[];
	gameScore: number | null;
	betterThan: number | null;
	email: string | null;
	notify: boolean;
}

export interface SubmitResult {
	id: number;
	date: string;
	dayNumber: number;
	status: 'scored' | 'waiting';
	rounds: ScoredRound[] | PastedRound[];
	gameScore: number | null;
	updatedScore: number | null;
	countsAsOf: string | null;
	notify: boolean;
}

export async function submitDive(userId: number | null, input: SubmitInput): Promise<SubmitResult> {
	const date = dateForDay(input.dayNumber);
	const today = etDate();
	// Only today's dive can still be scored from fresh data; an older one only if
	// we happen to have its snapshot.
	if (date > today) throw new KrillionError(`Dive #${input.dayNumber} hasn't happened yet.`);
	const day = await loadDay(date);
	if (date < today && !day.scored) {
		throw new KrillionError(
			`We don't have the counts for dive #${input.dayNumber} (${date}), so it can't be rescored.`
		);
	}
	if (input.rounds.length !== 7)
		throw new KrillionError('A dive has 7 rounds; this one has ' + input.rounds.length + '.');

	let email: string | null = null;
	if (!userId && input.notify) {
		email = (input.email ?? '').trim().toLowerCase();
		if (!EMAIL_RE.test(email) || email.length > 254)
			throw new KrillionError('That email address doesn’t look right.');
	}

	const rounds = input.rounds.map((r, i) => ({
		round: i + 1,
		prompt: String(r.prompt ?? '').slice(0, 300),
		answer: r.answer ? String(r.answer).slice(0, 200) : null,
		typed: r.typed ? String(r.typed).slice(0, 200) : null,
		miss: Boolean(r.miss) || !r.answer,
		othersChose: Number.isFinite(r.othersChose) ? r.othersChose : null,
		gamePoints: Number.isFinite(r.gamePoints) ? r.gamePoints : null
	}));

	let id: number;
	if (userId) {
		const [row] = await sql<{ id: string }[]>`
			insert into krillion_submissions (date, day_number, user_id, notify, rounds, game_score, game_better_than)
			values (${date}, ${input.dayNumber}, ${userId}, ${input.notify}, ${sql.json(rounds as never)},
				${input.gameScore}, ${input.betterThan})
			on conflict (user_id, date) where user_id is not null do update set
				notify = excluded.notify, rounds = excluded.rounds, game_score = excluded.game_score,
				game_better_than = excluded.game_better_than, scored = null, updated_score = null,
				scored_at = null, notified_at = null, created_at = now()
			returning id
		`;
		id = Number(row.id);
	} else {
		const [row] = await sql<{ id: string }[]>`
			insert into krillion_submissions (date, day_number, email, notify, rounds, game_score, game_better_than)
			values (${date}, ${input.dayNumber}, ${email}, ${input.notify && Boolean(email)},
				${sql.json(rounds as never)}, ${input.gameScore}, ${input.betterThan})
			returning id
		`;
		id = Number(row.id);
	}

	if (day.scored) {
		const answers = await sql<AnswerRow[]>`
			select prompt_id, answer, count, game_score, points from krillion_answers where date = ${date}
		`;
		const { scored, total } = scoreRounds(rounds, day.prompts, answers);
		await sql`
			update krillion_submissions set scored = ${sql.json(scored as never)}, updated_score = ${total}, scored_at = now()
			where id = ${id}
		`;
		return {
			id,
			date,
			dayNumber: input.dayNumber,
			status: 'scored',
			rounds: scored,
			gameScore: input.gameScore,
			updatedScore: total,
			countsAsOf: day.countsAsOf,
			notify: input.notify
		};
	}
	return {
		id,
		date,
		dayNumber: input.dayNumber,
		status: 'waiting',
		rounds,
		gameScore: input.gameScore,
		updatedScore: null,
		countsAsOf: null,
		notify: input.notify
	};
}

export async function mySubmissions(userId: number) {
	return sql<
		{
			date: string;
			day_number: number;
			game_score: number | null;
			updated_score: number | null;
			notify: boolean;
			scored: ScoredRound[] | null;
		}[]
	>`
		select to_char(date, 'YYYY-MM-DD') as date, day_number, game_score, updated_score, notify, scored
		from krillion_submissions where user_id = ${userId}
		order by date desc limit 30
	`;
}

// ---------------- the cron ----------------

// Fetch once a day: the first tick at or after 11am ET with no snapshot yet.
export async function fetchIfDue(now = new Date()) {
	const date = etDate(now);
	if (etHour(now) < FETCH_HOUR_ET)
		return { fetched: false, reason: `before ${FETCH_HOUR_ET}:00 ET` };
	const [have] = await sql`select 1 from krillion_days where date = ${date}`;
	if (have) return { fetched: false, reason: `already have ${date}` };
	return { fetched: true, ...(await fetchAndScore(date)) };
}

// Final scores, once the day is over (any date before today's in ET).
export async function sendFinalEmailsIfDue(now = new Date()) {
	const today = etDate(now);
	const due = await sql<
		{
			id: string;
			date: string;
			day_number: number;
			email: string | null;
			user_email: string | null;
			game_score: number | null;
			updated_score: number | null;
			scored: ScoredRound[] | null;
		}[]
	>`
		select s.id, to_char(s.date, 'YYYY-MM-DD') as date, s.day_number, s.email, u.email as user_email,
			s.game_score, s.updated_score, s.scored
		from krillion_submissions s left join users u on u.id = s.user_id
		where s.notify and s.notified_at is null and s.date < ${today}
		order by s.date
		limit 200
	`;
	let sent = 0;
	for (const s of due) {
		const to = s.user_email ?? s.email;
		if (to && s.scored) {
			const lines = s.scored.map(
				(r) =>
					`${r.round}. ${r.prompt}\n   ${r.miss ? 'miss' : r.match} — game ${r.gamePoints ?? 0}, rescored ${r.points.toFixed(1)}`
			);
			await sendEmail({
				to,
				subject: `Krillion #${s.day_number}: your final rescored total is ${(s.updated_score ?? 0).toFixed(1)}`,
				text: [
					`Krillion dive #${s.day_number} (${s.date}) is over. Your final scores:`,
					'',
					`Game score:     ${s.game_score ?? '—'}`,
					`Rescored total: ${(s.updated_score ?? 0).toFixed(1)}`,
					'',
					...lines,
					'',
					`See how the rescoring works: ${SITE}/krillion`,
					s.user_email ? '' : 'You asked for this one email; we have now deleted your address.'
				].join('\n')
			});
			sent++;
		} else if (to) {
			// The day's snapshot never arrived (fetch failed): say so rather than go quiet.
			await sendEmail({
				to,
				subject: `Krillion #${s.day_number}: we couldn't rescore this one`,
				text: [
					`Sorry — we didn't manage to fetch the answer counts for Krillion dive #${s.day_number} (${s.date}),`,
					'so there is no rescored total for it. Your game score stands as it was.',
					'',
					`${SITE}/krillion`,
					s.user_email ? '' : 'You asked for this one email; we have now deleted your address.'
				].join('\n')
			});
			sent++;
		}
		// Guests' addresses are only kept until this email is sent.
		await sql`update krillion_submissions set notified_at = now(), email = null where id = ${s.id}`;
	}
	return { sent, checked: due.length };
}
