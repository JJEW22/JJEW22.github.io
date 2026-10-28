// src/lib/server/krillion.ts
// Krillion, rescored: the daily snapshot, scoring, submissions and emails.
//
// We haven't asked Krillion's developer for permission yet, so this contacts
// krillion.io TWICE a day: the first cron tick after 11am ET fetches today's
// prompts, answer sheet and answer counts (three GETs, the same public ones the
// game itself uses), and the first tick after 11pm ET refreshes them so the
// final scores use near-end-of-day counts. Every dive is rescored against the
// latest snapshot. To fetch more often, add slots to fetchIfDue() -- the tables
// and the rescoring already handle it.
//
// Not here on purpose: cheater removal, miss rates and "better than X%"
// standings. They need the score histogram, which only comes from the game's
// own "finished a game" POST, and we don't call that.

import crypto from 'node:crypto';
import { sql } from '$lib/server/db';
import { checkName } from '$lib/names';
import { sendEmail } from '$lib/server/email';
import {
	acceptedPoints,
	dateForDay,
	dayForDate,
	etDate,
	etHour,
	MIN_DIVES_FOR_AVERAGE,
	breadth,
	matchAnswer,
	openDiveDate,
	rarityPercentile,
	SUBMIT_DEADLINE_TEXT,
	scoreDay,
	type PastedRound,
	type PromptFit
} from '$lib/krillion';

const BASE = 'https://krillion.io';
const FETCH_HOUR_ET = 11;
// The second scheduled fetch: the day's counts refreshed before it ends.
const LATE_FETCH_HOUR_ET = 23;
const SITE = 'https://johnjackwilkins.com';
// Identify ourselves; a contact makes it easy for the developer to reach us.
const UA = `johnjackwilkins.com krillion-rescore (once daily; contact ${SITE})`;

export class KrillionError extends Error {
	constructor(
		message: string,
		public status = 400,
		// Extra fields for the JSON error response.
		public details: Record<string, unknown> = {}
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

// `scheduled` marks the day's cron fetch as done; an admin's "Fetch now" leaves
// it unset, so the scheduled fetch still runs at its time.
export async function fetchAndScore(
	date: string,
	scheduled = true
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

	// Counted answers keep Krillion's spelling from the counts; sheet answers
	// nobody gave come in at 0; counted answers the sheet groups (some p7 birds
	// on 2026-10-02) keep a null game score.
	const lists = today.prompts.map((p) => {
		const merged = new Map<string, { answer: string; count: number; gameScore: number | null }>();
		for (const [answer, count] of Object.entries(pop.prompts[p.id] ?? {})) {
			merged.set(answer.toLowerCase(), { answer, count, gameScore: null });
		}
		for (const a of reveal.prompts.find((r) => r.id === p.id)?.answers ?? []) {
			const hit = merged.get(a.answer.toLowerCase());
			if (hit) hit.gameScore = a.score;
			else merged.set(a.answer.toLowerCase(), { answer: a.answer, count: 0, gameScore: a.score });
		}
		return [...merged.values()];
	});
	const { model, rows } = await scoreLists(date, today.prompts, lists);

	await sql.begin(async (tx) => {
		await tx`
			insert into krillion_days
				(date, day_number, prompts, fetched_at, counts_as_of, model, cron_fetched_at)
			values (${date}, ${today.dayNumber}, ${tx.json(today.prompts)}, now(), ${pop.asOf},
				${tx.json(model as never)}, ${scheduled ? new Date() : null})
			on conflict (date) do update set
				day_number = excluded.day_number, prompts = excluded.prompts, fetched_at = excluded.fetched_at,
				counts_as_of = excluded.counts_as_of, model = excluded.model, updated_at = now(),
				cron_fetched_at = coalesce(excluded.cron_fetched_at, krillion_days.cron_fetched_at)
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

type AnswerInsert = {
	date: string;
	prompt_id: string;
	answer: string;
	count: number;
	game_score: number | null;
	points: number;
};

// ---------------- the all-time breadth range ----------------

export interface StoredRange {
	min: number;
	minDate: string;
	minPrompt: string;
	max: number;
	maxDate: string;
	maxPrompt: string;
}

export async function getBreadthRange(): Promise<StoredRange | null> {
	try {
		const [r] = await sql<
			{
				min_breadth: number;
				min_date: string;
				min_prompt: string;
				max_breadth: number;
				max_date: string;
				max_prompt: string;
			}[]
		>`
			select min_breadth, to_char(min_date, 'YYYY-MM-DD') as min_date, min_prompt,
				max_breadth, to_char(max_date, 'YYYY-MM-DD') as max_date, max_prompt
			from krillion_breadth_range where id = 1
		`;
		return r
			? {
					min: r.min_breadth,
					minDate: r.min_date,
					minPrompt: r.min_prompt,
					max: r.max_breadth,
					maxDate: r.max_date,
					maxPrompt: r.max_prompt
				}
			: null;
	} catch (err) {
		// Before sql/031 is applied: no stored range, so the day's own range is used.
		if ((err as { code?: string })?.code === '42P01') return null;
		throw err;
	}
}

// Widen the stored range with a scored day's breadths (never narrow it).
async function widenBreadthRange(
	date: string,
	prompts: { id: string; text: string }[],
	model: Record<string, PromptFit>
): Promise<void> {
	const cur = await getBreadthRange();
	let next: StoredRange | null = cur ? { ...cur } : null;
	for (const p of prompts) {
		const b = model[p.id]?.breadth;
		if (b === undefined || !Number.isFinite(b) || b <= 0) continue;
		if (!next) {
			next = { min: b, minDate: date, minPrompt: p.text, max: b, maxDate: date, maxPrompt: p.text };
			continue;
		}
		if (b < next.min) Object.assign(next, { min: b, minDate: date, minPrompt: p.text });
		if (b > next.max) Object.assign(next, { max: b, maxDate: date, maxPrompt: p.text });
	}
	if (!next) return;
	await sql`
		insert into krillion_breadth_range
			(id, min_breadth, min_date, min_prompt, max_breadth, max_date, max_prompt, updated_at)
		values (1, ${next.min}, ${next.minDate}, ${next.minPrompt}, ${next.max}, ${next.maxDate},
			${next.maxPrompt}, now())
		on conflict (id) do update set
			min_breadth = excluded.min_breadth, min_date = excluded.min_date, min_prompt = excluded.min_prompt,
			max_breadth = excluded.max_breadth, max_date = excluded.max_date, max_prompt = excluded.max_prompt,
			updated_at = now()
	`;
}

// Rebuild the range from every stored day's counts (breadth needs only the
// counts, which every stored day has), replacing what's stored.
export async function rebuildBreadthRange(): Promise<StoredRange | null> {
	const days = await sql<{ date: string; prompts: { id: string; text: string }[] }[]>`
		select to_char(date, 'YYYY-MM-DD') as date, prompts from krillion_days order by date
	`;
	await sql`delete from krillion_breadth_range`;
	for (const d of days) {
		const rows = await sql<{ prompt_id: string; count: number }[]>`
			select prompt_id, count from krillion_answers where date = ${d.date}
		`;
		const model: Record<string, PromptFit> = {};
		for (const p of d.prompts) {
			const answers = rows
				.filter((r) => r.prompt_id === p.id)
				.map((r) => ({ answer: '', count: r.count, gameScore: null }));
			if (answers.length) model[p.id] = { breadth: breadth(answers) } as PromptFit;
		}
		await widenBreadthRange(d.date, d.prompts, model);
	}
	return getBreadthRange();
}

// Score a day's answer lists together: each prompt's top score depends on its
// breadth against the all-time range (widened by this day), then lay them out
// for the tables. Widens the stored range with the day afterwards.
async function scoreLists(
	date: string,
	prompts: { id: string; text: string }[],
	lists: { answer: string; count: number; gameScore: number | null }[][]
): Promise<{ model: Record<string, PromptFit>; rows: AnswerInsert[] }> {
	const keep = prompts.map((p, i) => ({ p, answers: lists[i] })).filter((x) => x.answers.length);
	const range = await getBreadthRange();
	const scored = scoreDay(
		keep.map((x) => x.answers),
		range ? { min: range.min, max: range.max } : null
	);
	const model: Record<string, PromptFit> = {};
	const rows: AnswerInsert[] = [];
	keep.forEach(({ p, answers }, i) => {
		model[p.id] = scored[i].fit;
		answers.forEach((a, j) =>
			rows.push({
				date,
				prompt_id: p.id,
				answer: a.answer,
				count: a.count,
				game_score: a.gameScore,
				points: scored[i].points[j]
			})
		);
	});
	await widenBreadthRange(date, prompts, model);
	return { model, rows };
}

// Re-run the scoring on a day we already have, from its stored counts -- no
// request to krillion.io. For when the model changes; every dive submitted
// that day is rescored with it.
export async function rescoreStoredDay(date: string): Promise<{ date: string; answers: number }> {
	const [day] = await sql<{ prompts: { id: string; text: string }[] }[]>`
		select prompts from krillion_days where date = ${date}
	`;
	if (!day) throw new KrillionError(`No stored counts for ${date}.`, 404);
	const stored = await sql<
		{ prompt_id: string; answer: string; count: number; game_score: number | null }[]
	>`
		select prompt_id, answer, count, game_score from krillion_answers where date = ${date}
		order by prompt_id, count desc, answer
	`;
	const lists = day.prompts.map((p) =>
		stored
			.filter((r) => r.prompt_id === p.id)
			.map((r) => ({ answer: r.answer, count: r.count, gameScore: r.game_score }))
	);
	const { model, rows } = await scoreLists(date, day.prompts, lists);
	await sql.begin(async (tx) => {
		await tx`update krillion_days set model = ${tx.json(model as never)}, updated_at = now() where date = ${date}`;
		await tx`delete from krillion_answers where date = ${date}`;
		for (let i = 0; i < rows.length; i += 1000) {
			await tx`insert into krillion_answers ${tx(rows.slice(i, i + 1000))}`;
		}
	});
	await rescoreDate(date);
	return { date, answers: rows.length };
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
	accepted?: boolean; // an admin-accepted word, not one of krillion.io's
}

export type ReviewStatus = 'pending' | 'accepted' | 'rejected';

const reviewKey = (promptId: string, answer: string) =>
	`${promptId}\u0000${answer.trim().toLowerCase()}`;

// What a day's dives are scored against: krillion.io's answers plus any words
// an admin accepted (scored from the prompt's fit), and every reviewed word's
// status. An accepted word that krillion.io has since listed itself scores as
// krillion.io's.
async function loadScoring(
	date: string
): Promise<{ answers: AnswerRow[]; reviews: Map<string, ReviewStatus> }> {
	const answers = await sql<AnswerRow[]>`
		select prompt_id, answer, count, game_score, points from krillion_answers where date = ${date}
	`;
	const [day] = await sql<{ model: Record<string, PromptFit> }[]>`
		select model from krillion_days where date = ${date}
	`;
	const words = await sql<{ prompt_id: string; answer: string; status: ReviewStatus }[]>`
		select prompt_id, answer, status from krillion_word_reviews where date = ${date}
	`;
	const listed = new Set(answers.map((a) => reviewKey(a.prompt_id, a.answer)));
	const reviews = new Map<string, ReviewStatus>();
	for (const w of words) {
		const key = reviewKey(w.prompt_id, w.answer);
		reviews.set(key, w.status);
		const fit = day?.model?.[w.prompt_id];
		if (w.status !== 'accepted' || !fit || listed.has(key)) continue;
		answers.push({
			prompt_id: w.prompt_id,
			answer: w.answer,
			count: 0,
			game_score: null,
			points: acceptedPoints(fit),
			accepted: true
		});
	}
	return { answers, reviews };
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
	// Percentile of rarity: % of players whose answer was more common. Null
	// for a miss, for an accepted word, and on dives scored before it existed.
	rarity?: number | null;
	// The answer isn't on the day's list (and so scores as a miss).
	unknown?: boolean;
	// The answer is a word an admin accepted after review.
	acceptedWord?: boolean;
	// The answer's own rescored points. `points` is what the round scores:
	// these, or an accepted override's.
	originalPoints?: number;
	// Another word sent for review. Until it's accepted the round scores the
	// answer; once it is, the override's points. `listedAs`: the override is
	// already on the day's list, so it isn't one to review.
	override?: {
		word: string;
		status: ReviewStatus | null;
		points: number | null;
		listedAs: string | null;
	} | null;
}

function scoreRounds(
	rounds: PastedRound[],
	prompts: { id: string; text: string }[],
	answers: AnswerRow[],
	reviews: Map<string, ReviewStatus> = new Map()
): { scored: ScoredRound[]; total: number } {
	const byPrompt = new Map<string, AnswerRow[]>();
	for (const a of answers) {
		if (!byPrompt.has(a.prompt_id)) byPrompt.set(a.prompt_id, []);
		byPrompt.get(a.prompt_id)!.push(a);
	}
	const norm = (t: string) =>
		t.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
	const scored = rounds.map((r, i) => {
		// The paste carries the prompt text (capitalised, on mobile); typed-in
		// rounds go by round number.
		const p =
			(r.prompt ? prompts.find((x) => norm(x.text) === norm(r.prompt)) : undefined) ??
			prompts[r.round - 1] ??
			prompts[i];
		const list = p ? (byPrompt.get(p.id) ?? []) : [];
		const hit = !r.miss && r.answer && p ? matchAnswer(list, r.answer) : null;
		const unknown = !r.miss && !!r.answer && !!p && !hit;
		const original = hit ? hit.points : 0;
		// The override, if any: scored only once an admin accepts it.
		const word = r.override?.trim() || null;
		let override: ScoredRound['override'] = null;
		if (word && p) {
			const status = reviews.get(reviewKey(p.id, word)) ?? null;
			const listed = matchAnswer(
				list.filter((a) => !a.accepted),
				word
			);
			const accepted =
				status === 'accepted'
					? list.find((a) => a.answer.toLowerCase() === word.toLowerCase())
					: undefined;
			override = {
				word,
				status: listed ? null : status,
				points: !listed && accepted ? accepted.points : null,
				listedAs: listed?.answer ?? null
			};
		}
		return {
			round: r.round,
			promptId: p?.id ?? null,
			prompt: p?.text ?? r.prompt,
			submitted: r.answer,
			match: hit?.answer ?? null,
			miss: r.miss || !hit,
			// The sheet's points for whatever answer was matched, so editing an
			// answer can't leave the pasted points behind. A miss scores 0 -- and
			// so does a word that isn't on krillion.io's list (sent for review, or
			// accepted since): the game counted it as a miss, and the game's total
			// should still add up rather than go blank.
			gamePoints: hit ? (hit.accepted ? 0 : (hit.game_score ?? r.gamePoints ?? null)) : 0,
			points: override?.points ?? original,
			originalPoints: original,
			count: hit ? hit.count : null,
			rarity:
				hit && !hit.accepted
					? rarityPercentile(
							hit.count,
							list.map((a) => a.count)
						)
					: null,
			unknown,
			acceptedWord: Boolean(hit?.accepted),
			override
		};
	});
	return { scored, total: scored.reduce((s, r) => s + r.points, 0) };
}

// The game's total, when every round's game points are known.
function gameTotal(rounds: { gamePoints: number | null }[]): number | null {
	if (rounds.some((r) => r.gamePoints === null || r.gamePoints === undefined)) return null;
	return rounds.reduce((s, r) => s + (r.gamePoints as number), 0);
}

// File a dive's overrides for review: words not on the day's list and not
// reviewed already. Returns whether anything new was filed.
async function fileReviews(
	date: string,
	sub: { id: number | string; user_id: number | string | null },
	scored: ScoredRound[],
	reviews: Map<string, ReviewStatus>
): Promise<boolean> {
	let filed = false;
	for (const r of scored) {
		const answer = r.override?.word;
		if (!answer || r.override?.listedAs || !r.promptId) continue;
		if (reviews.has(reviewKey(r.promptId, answer))) continue;
		await sql`
			insert into krillion_word_reviews (date, prompt_id, answer, user_id, submission_id)
			values (${date}, ${r.promptId}, ${answer.slice(0, 200)}, ${sub.user_id}, ${sub.id})
			on conflict do nothing
		`;
		reviews.set(reviewKey(r.promptId, answer), 'pending');
		filed = true;
	}
	return filed;
}

export async function rescoreDate(date: string): Promise<number> {
	const day = await loadDay(date);
	if (!day.scored) return 0;
	const { answers, reviews } = await loadScoring(date);
	const subs = await sql<{ id: string; user_id: string | null; rounds: PastedRound[] }[]>`
		select id, user_id, rounds from krillion_submissions where date = ${date}
	`;
	// Dives submitted before the counts arrived couldn't be checked then: their
	// overrides are filed now.
	for (const s of subs) {
		const { scored } = scoreRounds(s.rounds, day.prompts, answers, reviews);
		await fileReviews(date, s, scored, reviews);
	}
	for (const s of subs) {
		const { scored, total } = scoreRounds(s.rounds, day.prompts, answers, reviews);
		await sql`
			update krillion_submissions
			set scored = ${sql.json(scored as never)}, updated_score = ${total}, scored_at = now(),
				game_score = coalesce(game_score, ${gameTotal(scored)})
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
	// Guests only: the name for the day's leaderboard. Blank gets a random tag.
	guestName: string | null;
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
	guestName: string | null; // the name a guest's dive went on the board under
}

// A guest who leaves the name blank still needs one on the board. Letters and
// digits that can't be misread for each other (no 0/O, 1/I).
const TAG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomGuestTag(): string {
	const bytes = crypto.randomBytes(4);
	return `Guest-${[...bytes].map((b) => TAG_CHARS[b % TAG_CHARS.length]).join('')}`;
}

export const GUEST_NAME_MAX = 40;

function guestNameFor(raw: string | null): string {
	const checked = checkName(raw);
	if (!checked.ok) return randomGuestTag();
	if (checked.value.length > GUEST_NAME_MAX) {
		throw new KrillionError(`That name is too long (${GUEST_NAME_MAX} characters).`);
	}
	return checked.value;
}

function okTotal(v: unknown): number | null {
	return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 770 ? v : null;
}

// The day a dive is for, checked: it has happened, and an old one needs its
// counts. Players also have to be inside the submission window (today's dive,
// or yesterday's until 12:15am ET); an admin entering a dive for a player
// doesn't.
async function diveDay(dayNumber: number, admin = false): Promise<{ date: string; day: DayView }> {
	const date = dateForDay(dayNumber);
	const today = etDate();
	if (date > today) throw new KrillionError(`Dive #${dayNumber} hasn't happened yet.`);
	if (!admin && date < openDiveDate()) {
		throw new KrillionError(
			`Submissions for dive #${dayNumber} closed at ${SUBMIT_DEADLINE_TEXT}, 15 minutes after the dive ended.`
		);
	}
	const day = await loadDay(date);
	if (date < today && !day.scored) {
		throw new KrillionError(
			`We don't have the counts for dive #${dayNumber} (${date}), so it can't be rescored.`
		);
	}
	return { date, day };
}

function cleanRounds(input: PastedRound[]): PastedRound[] {
	if (input.length !== 7)
		throw new KrillionError('A dive has 7 rounds; this one has ' + input.length + '.');
	const okPoints = (v: unknown) =>
		typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 110 ? v : null;
	return input.map((r, i) => ({
		round: i + 1,
		prompt: String(r.prompt ?? '').slice(0, 300),
		answer: r.answer ? String(r.answer).slice(0, 200) : null,
		typed: r.typed ? String(r.typed).slice(0, 200) : null,
		miss: Boolean(r.miss) || !r.answer || !String(r.answer).trim(),
		othersChose: Number.isFinite(r.othersChose) ? r.othersChose : null,
		gamePoints: !r.answer || !String(r.answer).trim() ? 0 : okPoints(r.gamePoints),
		found: Boolean(r.found),
		override: r.override ? String(r.override).trim().slice(0, 200) || null : null
	}));
}

// With the day's list in, every answer has to be on it: a word that isn't is
// refused, naming the rounds, so the page can move it to an override for
// review. So is an override that's already on the list -- that's just an
// answer. Returns what the dive is scored against (null before the counts).
async function checkRounds(date: string, day: DayView, rounds: PastedRound[]) {
	const scoring = day.scored ? await loadScoring(date) : null;
	if (scoring) {
		const { scored } = scoreRounds(rounds, day.prompts, scoring.answers, scoring.reviews);
		const unknownRounds = scored.filter((r) => r.unknown).map((r) => r.round);
		if (unknownRounds.length) {
			throw new KrillionError(
				unknownRounds.length === 1
					? `Round ${unknownRounds[0]}'s answer isn't in the database.`
					: `Rounds ${unknownRounds.join(', ')} have answers that aren't in the database.`,
				422,
				{ unknownRounds }
			);
		}
		const listed = scored.filter((r) => r.override?.listedAs);
		if (listed.length) {
			throw new KrillionError(
				listed
					.map(
						(r) =>
							`Round ${r.round}: “${r.override!.word}” is already in the database (as “${r.override!.listedAs}”), so it doesn't need an override.`
					)
					.join(' '),
				422,
				{ listedOverrides: listed.map((r) => r.round) }
			);
		}
	}
	return scoring;
}

// A dive saved before the day's counts are in can't be checked or scored yet,
// but its overrides go into the review queue straight away rather than
// waiting for the 11am fetch. Without the day's prompts, each is filed under
// its round's prompt id: krillion.io numbers them p1-p7 in round order (true
// of every stored day), which is the key the fetch's own filing uses too, so
// there's no duplicate when the counts arrive.
async function fileEarlyReviews(
	date: string,
	sub: { id: number; user_id: number | null },
	rounds: PastedRound[]
): Promise<void> {
	for (const r of rounds) {
		const word = r.override?.trim();
		if (!word) continue;
		await sql`
			insert into krillion_word_reviews (date, prompt_id, answer, user_id, submission_id)
			values (${date}, ${'p' + r.round}, ${word.slice(0, 200)}, ${sub.user_id}, ${sub.id})
			on conflict do nothing
		`;
	}
}

// Score a saved dive (when the day's counts are in), filing its overrides.
async function scoreSaved(
	id: number,
	userId: number | null,
	date: string,
	day: DayView,
	rounds: PastedRound[],
	scoring: Awaited<ReturnType<typeof loadScoring>>
) {
	const { answers, reviews } = scoring;
	const first = scoreRounds(rounds, day.prompts, answers, reviews);
	await fileReviews(date, { id, user_id: userId }, first.scored, reviews);
	const { scored, total } = scoreRounds(rounds, day.prompts, answers, reviews);
	await sql`
		update krillion_submissions set scored = ${sql.json(scored as never)}, updated_score = ${total},
			scored_at = now(), game_score = coalesce(game_score, ${gameTotal(scored)})
		where id = ${id}
	`;
	return { scored, total };
}

export async function submitDive(userId: number | null, input: SubmitInput): Promise<SubmitResult> {
	const { date, day } = await diveDay(input.dayNumber);
	let email: string | null = null;
	if (!userId && input.notify) {
		email = (input.email ?? '').trim().toLowerCase();
		if (!EMAIL_RE.test(email) || email.length > 254)
			throw new KrillionError('That email address doesn’t look right.');
	}
	const guestName = userId ? null : guestNameFor(input.guestName);
	const rounds = cleanRounds(input.rounds);
	const scoring = await checkRounds(date, day, rounds);
	// The game's total: the paste's own figure if it had one, else the rounds' sum.
	const gameScore = okTotal(input.gameScore) ?? gameTotal(rounds);

	let id: number;
	if (userId) {
		const [row] = await sql<{ id: string }[]>`
			insert into krillion_submissions (date, day_number, user_id, notify, rounds, game_score, game_better_than)
			values (${date}, ${input.dayNumber}, ${userId}, ${input.notify}, ${sql.json(rounds as never)},
				${gameScore}, ${input.betterThan})
			on conflict (user_id, date) where user_id is not null do update set
				notify = excluded.notify, rounds = excluded.rounds, game_score = excluded.game_score,
				game_better_than = excluded.game_better_than, scored = null, updated_score = null,
				scored_at = null, notified_at = null, created_at = now(), edited_by = null, edited_at = null
			returning id
		`;
		id = Number(row.id);
	} else {
		const [row] = await sql<{ id: string }[]>`
			insert into krillion_submissions
				(date, day_number, email, notify, rounds, game_score, game_better_than, guest_name)
			values (${date}, ${input.dayNumber}, ${email}, ${input.notify && Boolean(email)},
				${sql.json(rounds as never)}, ${gameScore}, ${input.betterThan}, ${guestName})
			returning id
		`;
		id = Number(row.id);
	}

	if (scoring) {
		const { scored, total } = await scoreSaved(id, userId, date, day, rounds, scoring);
		return {
			id,
			date,
			dayNumber: input.dayNumber,
			status: 'scored',
			rounds: scored,
			gameScore: gameScore ?? gameTotal(scored),
			updatedScore: total,
			countsAsOf: day.countsAsOf,
			notify: input.notify,
			guestName
		};
	}
	await fileEarlyReviews(date, { id, user_id: userId }, rounds);
	return {
		id,
		date,
		dayNumber: input.dayNumber,
		status: 'waiting',
		rounds,
		gameScore,
		updatedScore: null,
		countsAsOf: null,
		notify: input.notify,
		guestName
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
			rounds: PastedRound[];
		}[]
	>`
		select to_char(date, 'YYYY-MM-DD') as date, day_number, game_score, updated_score, notify,
			scored, rounds
		from krillion_submissions where user_id = ${userId}
		order by date desc limit 30
	`;
}

// ---------------- the cron ----------------

// Fetch twice a day: the first tick at or after 11am ET, and the first at or
// after 11pm ET. Each is gated on its own scheduled run, not on any snapshot
// existing: an admin's "Fetch now" must not cancel either one.
export async function fetchIfDue(now = new Date()) {
	const date = etDate(now);
	const hour = etHour(now);
	if (hour < FETCH_HOUR_ET) return { fetched: false, reason: `before ${FETCH_HOUR_ET}:00 ET` };
	const [row] = await sql<{ cron_fetched_at: Date | null; late_fetched_at: Date | null }[]>`
		select cron_fetched_at, late_fetched_at from krillion_days where date = ${date}
	`;
	if (!row?.cron_fetched_at) {
		return { fetched: true, slot: `${FETCH_HOUR_ET}:00`, ...(await fetchAndScore(date, true)) };
	}
	if (hour >= LATE_FETCH_HOUR_ET && !row.late_fetched_at) {
		const result = await fetchAndScore(date, false);
		await sql`update krillion_days set late_fetched_at = now() where date = ${date}`;
		return { fetched: true, slot: `${LATE_FETCH_HOUR_ET}:00`, ...result };
	}
	return {
		fetched: false,
		reason:
			hour >= LATE_FETCH_HOUR_ET
				? `already fetched ${date} at ${FETCH_HOUR_ET}:00 and ${LATE_FETCH_HOUR_ET}:00`
				: `already fetched ${date} at ${FETCH_HOUR_ET}:00; next at ${LATE_FETCH_HOUR_ET}:00 ET`
	};
}

// An admin's "Fetch now": today's counts and sheet, right away, whatever the
// time -- before 11am included -- and every dive submitted today rescored.
// Doesn't count as the scheduled fetch. A short cooldown keeps repeated clicks
// from hammering krillion.io.
const FORCE_COOLDOWN_MS = 2 * 60_000;

export async function forceFetch(now = new Date()) {
	const date = etDate(now);
	const [last] = await sql<{ fetched_at: Date }[]>`
		select fetched_at from krillion_days where date = ${date}
	`;
	if (last && now.getTime() - new Date(last.fetched_at).getTime() < FORCE_COOLDOWN_MS) {
		const wait = Math.ceil(
			(FORCE_COOLDOWN_MS - (now.getTime() - new Date(last.fetched_at).getTime())) / 1000
		);
		throw new KrillionError(`Fetched less than 2 minutes ago — try again in ${wait}s.`, 429);
	}
	const result = await fetchAndScore(date, false);
	const [rescored] = await sql<{ n: number }[]>`
		select count(*)::int as n from krillion_submissions where date = ${date}
	`;
	return { ...result, rescoredDives: rescored.n };
}

// Final scores, once a dive's submissions have closed (12:15am ET the next day).
export async function sendFinalEmailsIfDue(now = new Date()) {
	const today = openDiveDate(now);
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

// ---------------- leaderboard ----------------
//
// Totals only: no answers, so today's board can't spoil today's dive. Names
// are the account name (users.real_name, set on /account) with the username
// as the fallback. A day's board includes guests, under the name they gave (or
// their random tag); the all-time board, built on averages, is accounts only,
// since a guest's dives can't be tied together.

export const KRILLION_ADMIN_ROLE = 'krillion:admin';

export interface LeaderRow {
	name: string;
	gameScore: number | null;
	updatedScore: number | null; // null while the day's counts aren't in
	dives: number; // the player's scored dives, all time (0 for a guest)
	average: number | null; // their all-time average rescored total (null for a guest)
	guest: boolean;
	isYou: boolean;
}

// `guestIds` are the dives this browser submitted as a guest, so a guest's own
// row can be marked as theirs; they only ever highlight, never reveal anything.
export async function leaderboardForDate(
	date: string,
	viewerId: number | null,
	guestIds: number[] = []
): Promise<LeaderRow[]> {
	const rows = await sql<
		{
			id: string;
			user_id: string | null;
			name: string;
			game_score: number | null;
			updated_score: number | null;
			dives: number;
			average: number | null;
		}[]
	>`
		select s.id, s.user_id, coalesce(u.real_name, u.username, s.guest_name, 'Guest') as name,
			s.game_score, s.updated_score, coalesce(a.dives, 0) as dives, a.average
		from krillion_submissions s
		left join users u on u.id = s.user_id
		left join (
			select user_id, count(*)::int as dives, avg(updated_score)::float8 as average
			from krillion_submissions where user_id is not null and updated_score is not null
			group by user_id
		) a on a.user_id = s.user_id
		where s.date = ${date}
		order by s.updated_score desc nulls last, s.game_score desc nulls last,
			lower(coalesce(u.real_name, u.username, s.guest_name, 'Guest'))
	`;
	return rows.map((r) => {
		const guest = r.user_id === null;
		return {
			name: r.name,
			gameScore: r.game_score,
			updatedScore: r.updated_score,
			dives: r.dives,
			average: guest ? null : r.average,
			guest,
			isYou: guest
				? viewerId === null && guestIds.includes(Number(r.id))
				: viewerId !== null && Number(r.user_id) === viewerId
		};
	});
}

export interface AllTimeRow {
	name: string;
	dives: number;
	average: number;
	best: number;
	averageGame: number | null;
	qualified: boolean; // at least MIN_DIVES_FOR_AVERAGE dives: ranked by average
	isYou: boolean;
}

// Every signed-in player with a scored dive. Players with MIN_DIVES_FOR_AVERAGE
// or more are ranked first, by average rescored total; the rest follow, still
// building up to it, so one lucky dive can't top the board.
export async function leaderboardAllTime(viewerId: number | null): Promise<AllTimeRow[]> {
	const rows = await sql<
		{
			user_id: string;
			name: string;
			dives: number;
			average: number;
			best: number;
			average_game: number | null;
		}[]
	>`
		select s.user_id, coalesce(u.real_name, u.username) as name,
			count(*)::int as dives, avg(s.updated_score)::float8 as average,
			max(s.updated_score)::float8 as best, avg(s.game_score)::float8 as average_game
		from krillion_submissions s join users u on u.id = s.user_id
		where s.updated_score is not null
		group by s.user_id, u.real_name, u.username
		order by (count(*) >= ${MIN_DIVES_FOR_AVERAGE}) desc, average desc, dives desc
	`;
	return rows.map((r) => ({
		name: r.name,
		dives: r.dives,
		average: r.average,
		best: r.best,
		averageGame: r.average_game,
		qualified: r.dives >= MIN_DIVES_FOR_AVERAGE,
		isYou: viewerId !== null && Number(r.user_id) === viewerId
	}));
}

// Days we have counts for, newest first, for the day pickers.
export async function listScoredDays(): Promise<{ date: string; dayNumber: number }[]> {
	const rows = await sql<{ date: string; day_number: number }[]>`
		select to_char(date, 'YYYY-MM-DD') as date, day_number from krillion_days order by date desc
	`;
	return rows.map((r) => ({ date: r.date, dayNumber: r.day_number }));
}

// ---------------- admin: every answer's score ----------------
//
// Today's answer scores would spoil today's dive, so an admin sees them only
// after submitting their own dive for the day. A finished day is open.

export interface AdminAnswer {
	answer: string;
	count: number;
	share: number;
	gameScore: number | null;
	points: number;
	accepted: boolean; // an Accepted Word, from review
}

export interface AdminDay {
	date: string;
	dayNumber: number;
	prompts: { id: string; text: string; fit: PromptFit | null; answers: AdminAnswer[] }[];
}

// A dive still open for submissions (today's, or yesterday's until 12:15am
// ET) stays hidden from an admin until they've submitted their own, so the
// admin page can't be used to look up a good answer.
async function adminCanSee(userId: number, date: string): Promise<boolean> {
	if (date < openDiveDate()) return true;
	const [mine] = await sql`
		select 1 from krillion_submissions where user_id = ${userId} and date = ${date}
	`;
	return Boolean(mine);
}

export async function assertAdminCanSee(userId: number, date: string): Promise<void> {
	if (!(await adminCanSee(userId, date))) {
		throw new KrillionError(
			"Submit your own dive for this one first: an open dive's answer scores stay hidden until you have.",
			403
		);
	}
}

export interface AdminSubmission {
	id: number;
	name: string; // account name, a guest's own name or tag, or "Guest"
	guest: boolean;
	gameScore: number | null;
	betterThan: number | null;
	updatedScore: number | null; // null while the day's counts aren't in
	submittedAt: string;
	editedBy: string | null; // the admin who last changed it on the player's behalf
	editedAt: string | null;
	rounds: ScoredRound[];
	// The answers as stored, for editing.
	answers: { answer: string | null; override: string | null }[];
}

// Every dive submitted for a day, signed in or not, with each round's
// conversion. Guest emails are never included.
export async function adminSubmissions(userId: number, date: string): Promise<AdminSubmission[]> {
	await assertAdminCanSee(userId, date);
	const rows = await sql<
		{
			id: number;
			name: string | null;
			guest: boolean;
			game_score: number | null;
			game_better_than: number | null;
			updated_score: number | null;
			created_at: Date;
			rounds: PastedRound[];
			scored: ScoredRound[] | null;
			edited_by: string | null;
			edited_at: Date | null;
		}[]
	>`
		select s.id::int as id, coalesce(u.real_name, u.username, s.guest_name) as name,
			s.user_id is null as guest, s.game_score,
			s.game_better_than, s.updated_score, s.created_at, s.rounds, s.scored,
			coalesce(e.real_name, e.username) as edited_by, s.edited_at
		from krillion_submissions s left join users u on u.id = s.user_id
		left join users e on e.id = s.edited_by
		where s.date = ${date}
		order by s.updated_score desc nulls last, s.game_score desc nulls last, s.created_at
	`;
	return rows.map((r) => ({
		id: r.id,
		name: r.name ?? 'Guest',
		guest: r.guest,
		gameScore: r.game_score,
		betterThan: r.game_better_than,
		updatedScore: r.updated_score,
		submittedAt: r.created_at.toISOString(),
		editedBy: r.edited_by,
		editedAt: r.edited_at?.toISOString() ?? null,
		answers: r.rounds.map((x) => ({
			answer: x.miss ? null : x.answer,
			override: x.override ?? null
		})),
		rounds:
			r.scored ??
			r.rounds.map((x) => ({
				round: x.round,
				promptId: null,
				prompt: x.prompt,
				submitted: x.answer,
				match: null,
				miss: x.miss || !x.answer,
				gamePoints: x.gamePoints,
				points: 0,
				count: null
			}))
	}));
}

export async function adminAnswers(userId: number, date: string): Promise<AdminDay> {
	await assertAdminCanSee(userId, date);
	const [day] = await sql<
		{
			day_number: number;
			prompts: { id: string; text: string }[];
			model: Record<string, PromptFit>;
		}[]
	>`
		select day_number, prompts, model from krillion_days where date = ${date}
	`;
	if (!day) throw new KrillionError(`No counts for ${date} yet.`, 404);
	const { answers: rows } = await loadScoring(date);
	const totals = new Map<string, number>();
	for (const r of rows) totals.set(r.prompt_id, (totals.get(r.prompt_id) ?? 0) + r.count);
	return {
		date,
		dayNumber: day.day_number,
		prompts: day.prompts.map((p) => {
			const total = totals.get(p.id) ?? 0;
			return {
				id: p.id,
				text: p.text,
				fit: day.model?.[p.id] ?? null,
				answers: rows
					.filter((r) => r.prompt_id === p.id)
					.map((r) => ({
						answer: r.answer,
						count: r.count,
						share: total > 0 ? r.count / total : 0,
						gameScore: r.game_score,
						points: r.points,
						accepted: Boolean(r.accepted)
					}))
			};
		})
	};
}

// ---------------- admin: words sent for review ----------------

export interface ReviewItem {
	id: number;
	date: string;
	dayNumber: number;
	promptId: string;
	prompt: string;
	answer: string;
	status: ReviewStatus;
	askedBy: string; // account name, or "Guest"
	askedAt: string;
	decidedAt: string | null;
	decidedBy: string | null;
	// What it scores (or would) once accepted: the prompt's target mean + 1 SD.
	acceptedPoints: number | null;
}

// Every word waiting for review, plus the most recent decisions. Today's
// words are held back until the admin has submitted today's dive, like
// today's answer scores.
export async function listReviews(
	userId: number
): Promise<{ pending: ReviewItem[]; decided: ReviewItem[]; hiddenToday: number }> {
	const hidden = new Set<string>();
	for (const d of new Set([openDiveDate(), etDate()])) {
		if (!(await adminCanSee(userId, d))) hidden.add(d);
	}
	const rows = await sql<
		{
			id: number;
			date: string;
			day_number: number | null;
			prompt_id: string;
			prompts: { id: string; text: string }[] | null;
			model: Record<string, PromptFit> | null;
			answer: string;
			status: ReviewStatus;
			asked_by: string | null;
			created_at: Date;
			decided_at: Date | null;
			decided_by: string | null;
			asked_rounds: PastedRound[] | null;
		}[]
	>`
		(select r.id::int as id, to_char(r.date, 'YYYY-MM-DD') as date, d.day_number, r.prompt_id,
			d.prompts, d.model, r.answer, r.status,
			coalesce(u.real_name, u.username, s.guest_name) as asked_by,
			r.created_at, r.decided_at, coalesce(a.real_name, a.username) as decided_by,
			s.rounds as asked_rounds
		from krillion_word_reviews r
		left join krillion_days d on d.date = r.date
		left join krillion_submissions s on s.id = r.submission_id
		left join users u on u.id = r.user_id
		left join users a on a.id = r.decided_by
		where r.status = 'pending'
		order by r.date desc, r.created_at)
		union all
		(select r.id::int, to_char(r.date, 'YYYY-MM-DD'), d.day_number, r.prompt_id, d.prompts, d.model,
			r.answer, r.status, coalesce(u.real_name, u.username), r.created_at, r.decided_at,
			coalesce(a.real_name, a.username), s.rounds
		from krillion_word_reviews r
		left join krillion_days d on d.date = r.date
		left join krillion_submissions s on s.id = r.submission_id
		left join users u on u.id = r.user_id
		left join users a on a.id = r.decided_by
		where r.status <> 'pending'
		order by r.decided_at desc nulls last
		limit 50)
	`;
	const items = rows.map(
		(r): ReviewItem => ({
			id: r.id,
			date: r.date,
			dayNumber: r.day_number ?? dayForDate(r.date),
			promptId: r.prompt_id,
			// Before the day's counts are in there's no prompt list: the asking
			// dive's paste has the prompt text (in capitals, from a phone).
			prompt:
				r.prompts?.find((p) => p.id === r.prompt_id)?.text ||
				r.asked_rounds?.find((x) => `p${x.round}` === r.prompt_id)?.prompt ||
				`Round ${r.prompt_id.replace(/^p/, '')}`,
			answer: r.answer,
			status: r.status,
			askedBy: r.asked_by ?? 'Guest',
			askedAt: r.created_at.toISOString(),
			decidedAt: r.decided_at?.toISOString() ?? null,
			decidedBy: r.decided_by,
			acceptedPoints: r.model?.[r.prompt_id] ? acceptedPoints(r.model[r.prompt_id]) : null
		})
	);
	const visible = items.filter((r) => !hidden.has(r.date));
	return {
		pending: visible.filter((r) => r.status === 'pending'),
		decided: visible.filter((r) => r.status !== 'pending'),
		hiddenToday:
			items.filter((r) => r.status === 'pending').length -
			visible.filter((r) => r.status === 'pending').length
	};
}

// Accept or reject a word (or put it back to pending), then rescore that
// day's dives so everyone who gave it gets the new score.
export async function decideReview(
	userId: number,
	id: number,
	status: ReviewStatus
): Promise<{ date: string; rescored: number }> {
	const [row] = await sql<{ date: string }[]>`
		select to_char(date, 'YYYY-MM-DD') as date from krillion_word_reviews where id = ${id}
	`;
	if (!row) throw new KrillionError('No such word.', 404);
	await assertAdminCanSee(userId, row.date);
	await sql`
		update krillion_word_reviews
		set status = ${status},
			decided_at = ${status === 'pending' ? null : new Date()},
			decided_by = ${status === 'pending' ? null : userId}
		where id = ${id}
	`;
	return { date: row.date, rescored: await rescoreDate(row.date) };
}

// ---------------- admin: a dive on a player's behalf ----------------

export interface AdminDiveInput {
	dayNumber: number;
	// Change this dive (a player's or a guest's)...
	submissionId?: number | null;
	// ...or enter one for this account (replacing any dive it has that day).
	player?: string | null; // username or account name
	answers: { answer: string | null; override: string | null }[];
	gameScore?: number | null; // null keeps the dive's game score (or sums the rounds)
}

// Players who've ever submitted a dive, for the admin's player picker.
export async function krillionPlayers(): Promise<{ username: string; name: string }[]> {
	const rows = await sql<{ username: string; name: string }[]>`
		select distinct u.username, coalesce(u.real_name, u.username) as name
		from krillion_submissions s join users u on u.id = s.user_id
		order by name
	`;
	return rows.map((r) => ({ username: r.username, name: r.name }));
}

// Enter or change a player's answers as an admin. Past the submission
// deadline too -- this is how a dive gets fixed after the fact. The same
// checks as a player's own submission apply (answers on the day's list, or
// sent as overrides), and the dive is rescored straight away. Rounds whose
// answer is unchanged keep what the paste said about them.
export async function adminSaveDive(adminId: number, input: AdminDiveInput) {
	const { date, day } = await diveDay(input.dayNumber, true);
	await assertAdminCanSee(adminId, date);
	if (!Array.isArray(input.answers) || input.answers.length !== 7) {
		throw new KrillionError('A dive has 7 rounds.');
	}

	let existing:
		| { id: number; user_id: number | null; rounds: PastedRound[]; game_score: number | null }
		| undefined;
	let userId: number | null = null;
	if (input.submissionId) {
		[existing] = await sql<NonNullable<typeof existing>[]>`
			select id::int as id, user_id::int as user_id, rounds, game_score
			from krillion_submissions where id = ${input.submissionId} and date = ${date}
		`;
		if (!existing) throw new KrillionError('No such dive on that day.', 404);
		userId = existing.user_id;
	} else {
		const who = String(input.player ?? '').trim();
		if (!who) throw new KrillionError('Pick a player.');
		const users = await sql<{ id: number }[]>`
			select id::int as id from users
			where lower(username) = lower(${who}) or lower(real_name) = lower(${who})
			limit 2
		`;
		if (users.length !== 1) {
			throw new KrillionError(
				users.length
					? `More than one account is called “${who}”: use the username.`
					: `No account “${who}”.`
			);
		}
		userId = users[0].id;
		[existing] = await sql<NonNullable<typeof existing>[]>`
			select id::int as id, user_id::int as user_id, rounds, game_score
			from krillion_submissions where user_id = ${userId} and date = ${date}
		`;
	}

	// What a round's answer is, as typed: '' for a miss.
	const answerOf = (r?: PastedRound) => (r && !r.miss ? (r.answer ?? '').trim() : '');
	const rounds = cleanRounds(
		input.answers.map((a, i): PastedRound => {
			const answer = typeof a?.answer === 'string' ? a.answer.trim() : '';
			const override = typeof a?.override === 'string' ? a.override.trim() : '';
			const before = existing?.rounds[i];
			// An unchanged answer keeps the paste's prompt, points and the rest.
			if (before && answerOf(before) === answer) {
				return { ...before, override: override || null };
			}
			return {
				round: i + 1,
				prompt: before?.prompt ?? '',
				answer: answer || null,
				typed: null,
				miss: !answer,
				othersChose: null,
				gamePoints: answer ? null : 0,
				found: false,
				override: override || null
			};
		})
	);
	const scoring = await checkRounds(date, day, rounds);
	const given = okTotal(input.gameScore);
	// A changed answer changes the game's total too, unless one is given: the
	// changed rounds' game points come from the day's sheet when it's scored.
	const changed = !existing || rounds.some((r, i) => answerOf(r) !== answerOf(existing.rounds[i]));
	const gameScore = given ?? (changed ? gameTotal(rounds) : existing!.game_score);

	let id: number;
	if (existing) {
		await sql`
			update krillion_submissions
			set rounds = ${sql.json(rounds as never)}, game_score = ${gameScore}, scored = null,
				updated_score = null, scored_at = null, edited_by = ${adminId}, edited_at = now()
			where id = ${existing.id}
		`;
		id = existing.id;
	} else {
		const [row] = await sql<{ id: number }[]>`
			insert into krillion_submissions
				(date, day_number, user_id, notify, rounds, game_score, edited_by, edited_at)
			values (${date}, ${input.dayNumber}, ${userId}, false, ${sql.json(rounds as never)},
				${gameScore}, ${adminId}, now())
			returning id::int as id
		`;
		id = row.id;
	}
	if (scoring) await scoreSaved(id, userId, date, day, rounds, scoring);
	else await fileEarlyReviews(date, { id, user_id: userId }, rounds);
	return { id, date };
}

// Delete a dive outright (a player's or a guest's), on any day. Words it sent
// for review stay in the queue; others may have given them too.
export async function adminDeleteDive(
	adminId: number,
	id: number
): Promise<{ date: string; name: string }> {
	const [row] = await sql<{ date: string; name: string | null }[]>`
		select to_char(s.date, 'YYYY-MM-DD') as date,
			coalesce(u.real_name, u.username, s.guest_name) as name
		from krillion_submissions s left join users u on u.id = s.user_id
		where s.id = ${id}
	`;
	if (!row) throw new KrillionError('No such dive.', 404);
	await assertAdminCanSee(adminId, row.date);
	await sql`delete from krillion_submissions where id = ${id}`;
	return { date: row.date, name: row.name ?? 'Guest' };
}
