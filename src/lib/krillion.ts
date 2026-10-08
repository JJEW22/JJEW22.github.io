// src/lib/krillion.ts
// Krillion, rescored: everything that is pure and client-safe.
//
//   - reading a pasted end screen ("select all, copy" on krillion.io)
//   - dive number <-> date
//   - the scoring model itself: a continuous, count-based score per answer
//
// The model was worked out in a spreadsheet analysis of dives #79-80 (2026-10-02/03):
//   points = bottom + (top - bottom) * F(u; a, b),   F = 1 - (1 - u^a)^b  (Kumaraswamy CDF)
//   top    = 90-125 per prompt by breadth (topScores): placed by where ln(breadth)
//            sits between the ALL-TIME smallest (90) and largest (125)
//   u      = surprisal relative to the prompt's most-given answer, scaled so the
//            most-given answer is 0 and the rarest is 1
//   bottom = BOTTOM_SCALE * q,  q = -ln(top share) / ln(answers on the prompt)
//   a, b   = fitted per prompt so that, picking answers in proportion to their
//            counts, the score's mean/SD equal a target: SPLIT_W x the game's own
//            scoring + (1 - SPLIT_W) x the game's tiers re-dealt by count.
// No cheater removal and no standings yet: both need the score histogram, which
// we don't request until Krillion's developer agrees.

// The rarest answer on a prompt scores between these, by how broad the prompt is
// compared with every prompt so far: the all-time narrowest gets TOP_MIN, the
// all-time broadest TOP_MAX.
export const TOP_MIN = 90;
export const TOP_MAX = 125;
export const TOP_SCORE = TOP_MAX; // the most any answer can score
export const BOTTOM_SCALE = 20;
export const SPLIT_W = 0.25;
export const SMOOTH_ALPHA = 1;
// Dives a player needs before their average counts on the leaderboard.
export const MIN_DIVES_FOR_AVERAGE = 5;

// ---------------- dates ----------------

const EPOCH = Date.UTC(2026, 6, 16); // dive #1 = 2026-07-16 (Krillion's own epoch)
const DAY_MS = 86_400_000;

export function dateForDay(dayNumber: number): string {
	return new Date(EPOCH + (dayNumber - 1) * DAY_MS).toISOString().slice(0, 10);
}

export function dayForDate(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS) + 1;
}

// Today's date where Krillion's day turns over (midnight, America/New_York).
export function etDate(at: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/New_York',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(at);
}

export function etHour(at: Date = new Date()): number {
	const h = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		hour: 'numeric',
		hourCycle: 'h23'
	}).format(at);
	return Number(h);
}

// ---------------- the paste ----------------

export interface PastedRound {
	round: number;
	prompt: string;
	answer: string | null; // the game's matched answer; null on a miss or when not found
	typed: string | null; // what was typed, shown only on a miss
	miss: boolean;
	othersChose: number | null;
	gamePoints: number | null;
	found: boolean; // false = this round wasn't in the paste; the player fills it in
}

export interface PastedDive {
	dayNumber: number | null; // null when the paste didn't include "Dive #N complete"
	score: number | null;
	betterThan: number | null;
	rounds: PastedRound[]; // always 7, in round order
	found: number; // how many of the 7 the paste covered
	complete: boolean; // all 7 found
	totalMatchesScore: boolean; // the found rounds add up to the score shown
}

const OTHERS_RE = /^([\d,]+)\s+other players? chose this$/i;
// Desktop copies the points and the "+" on separate lines; mobile joins them ("10+").
const POINTS_RE = /^(\d{1,3})\s*\+?$/;
const ROUND_RE = /^[1-7]$/;
const PROMPT_RE = /^name\b/i;

// Prompts compared loosely: mobile copies them in capitals, and quote styles vary.
function normPrompt(s: string): string {
	return s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function emptyRound(round: number): PastedRound {
	return {
		round,
		prompt: '',
		answer: null,
		typed: null,
		miss: false,
		othersChose: null,
		gamePoints: null,
		found: false
	};
}

// Read one round's tail starting at the answer line: answer, optional
// "N other players chose this", optional points. Returns the round's fields and
// the index just past them.
function readTail(lines: string[], j: number) {
	const shown = lines[j] ?? '';
	const quoted = /^".*"$/.test(shown) || shown === '?';
	let k = j + 1;
	let others: number | null = null;
	const m = (lines[k] ?? '').match(OTHERS_RE);
	if (m) {
		others = Number(m[1].replace(/,/g, ''));
		k++;
	}
	const pm = (lines[k] ?? '').match(POINTS_RE);
	// Not the next round's number ("<1-7>" followed by its prompt).
	const nextRound = ROUND_RE.test(lines[k] ?? '') && PROMPT_RE.test(lines[k + 1] ?? '');
	const points = pm && !nextRound ? Number(pm[1]) : null;
	if (points !== null) k++;
	return {
		answer: quoted ? null : shown,
		typed: quoted && shown !== '?' ? shown.slice(1, -1) : null,
		miss: quoted || points === 0,
		othersChose: others,
		gamePoints: points,
		next: k
	};
}

// The end screen copies as one item per line. Each round reads:
//   <round n>, <prompt>, <answer | "typed text" on a miss>, [<N> other players chose this], <points>[+]
// Anything else on the page (menus, legend, shop link) is ignored, and so is a
// paste that only covers part of the page: whatever rounds it holds are found,
// the rest come back as found: false for the player to fill in. With the day's
// prompts, rounds are also found by their prompt text alone.
export function parsePaste(text: string, prompts: { text: string }[] = []): PastedDive {
	const lines = text
		.replace(/\r/g, '')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '');

	const dayIdx = lines.findIndex((l) => /^Dive #\d+ complete$/i.test(l));
	const dayNumber = dayIdx >= 0 ? Number(lines[dayIdx].match(/#(\d+)/)![1]) : null;
	const score =
		dayIdx >= 0 && /^\d+$/.test(lines[dayIdx + 1] ?? '') ? Number(lines[dayIdx + 1]) : null;
	const better = lines
		.map((l) => l.match(/^better than (\d+)% of today's players$/i))
		.find(Boolean);

	const rounds: PastedRound[] = [1, 2, 3, 4, 5, 6, 7].map(emptyRound);
	const known = prompts.map((p) => normPrompt(p.text));
	// Lines already read into a round, so no later step reads them twice.
	const used = new Set<number>();
	const take = (from: number, to: number) => {
		for (let k = from; k < to; k++) used.add(k);
	};

	// 1. Rounds with their number and prompt: "<n>" then "Name ...".
	let firstMarker = -1;
	for (let i = 0; i < lines.length - 1; i++) {
		if (!ROUND_RE.test(lines[i]) || !PROMPT_RE.test(lines[i + 1])) continue;
		const n = Number(lines[i]);
		if (rounds[n - 1].found) continue;
		if (firstMarker < 0) firstMarker = i;
		const tail = readTail(lines, i + 2);
		rounds[n - 1] = { round: n, prompt: lines[i + 1], ...tail, found: true };
		take(i, tail.next);
		i = tail.next - 1;
	}

	// 2. With the day's prompts: a prompt line on its own (its number cut off).
	for (let r = 0; r < 7 && known.length === 7; r++) {
		if (rounds[r].found) continue;
		const at = lines.findIndex((l, k) => !used.has(k) && normPrompt(l) === known[r]);
		if (at >= 0 && at + 1 < lines.length) {
			const tail = readTail(lines, at + 1);
			rounds[r] = { round: r + 1, prompt: lines[at], ...tail, found: true };
			take(at, tail.next);
		}
	}

	// 3. A round cut off at the top of the paste: before the first numbered round
	//    there's just "<answer>", "<N> other players chose this", "<points>". It
	//    belongs to the round before the first one found.
	const firstFound = rounds.findIndex((r) => r.found);
	if (firstMarker > 0 && firstFound > 0 && !rounds[firstFound - 1].found) {
		let o = -1;
		for (let i = firstMarker - 1; i >= 1; i--) {
			if (used.has(i)) break; // anything above a claimed line isn't the cut-off round
			if (OTHERS_RE.test(lines[i])) {
				o = i;
				break;
			}
		}
		if (
			o >= 1 &&
			!used.has(o - 1) &&
			!PROMPT_RE.test(lines[o - 1]) &&
			!ROUND_RE.test(lines[o - 1])
		) {
			const tail = readTail(lines, o - 1);
			const n = firstFound; // zero-based index of the round before
			rounds[n - 1] = {
				round: n,
				prompt: known[n - 1] ? prompts[n - 1].text : '',
				...tail,
				found: true
			};
		}
	}

	const foundRounds = rounds.filter((r) => r.found);
	const total = foundRounds.reduce((s, r) => s + (r.gamePoints ?? 0), 0);
	return {
		dayNumber,
		score,
		betterThan: better ? Number(better[1]) : null,
		rounds,
		found: foundRounds.length,
		complete: foundRounds.length === 7,
		totalMatchesScore: score !== null && foundRounds.length === 7 && total === score
	};
}

// ---------------- the scoring model ----------------

export interface ModelAnswer {
	answer: string;
	count: number;
	gameScore: number | null;
}

export interface PromptFit {
	a: number;
	b: number;
	q: number;
	bottom: number;
	gameMean: number;
	gameSd: number;
	sortedMean: number;
	sortedSd: number;
	targetMean: number;
	targetSd: number;
	fittedMean: number;
	fittedSd: number;
	top: number; // what the rarest answer on this prompt scores (TOP_MIN..TOP_MAX)
	breadth: number; // sqrt(n) / sum of squared shares; the all-time largest gets TOP_MAX
}

function kuma(u: number, a: number, b: number): number {
	const v = Math.min(1, Math.max(0, u));
	return 1 - Math.pow(1 - Math.pow(v, a), b);
}

function weightedMoments(weights: number[], values: number[]): [number, number] {
	let w = 0,
		m = 0,
		m2 = 0;
	for (let i = 0; i < values.length; i++) {
		w += weights[i];
		m += weights[i] * values[i];
		m2 += weights[i] * values[i] * values[i];
	}
	if (w <= 0) return [0, 0];
	m /= w;
	return [m, Math.sqrt(Math.max(0, m2 / w - m * m))];
}

function geomspace(lo: number, hi: number, n: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < n; i++) out.push(lo * Math.pow(hi / lo, i / (n - 1)));
	return out;
}

// Score every answer on one prompt. Returns the points (same order as `answers`)
// and the fit. Answers with no players still get points (they just carry no
// weight in the fit).
export function scorePrompt(
	answers: ModelAnswer[],
	topScore: number = TOP_MAX
): { points: number[]; fit: PromptFit } {
	const n = answers.length;
	const K = answers.map((x) => Math.max(0, x.count));
	const L = K.reduce((s, k) => s + k, 0);

	// smoothed share -> surprisal -> x (vs the rarest) -> u (vs the most-given)
	const I = K.map((k) => -Math.log((k + SMOOTH_ALPHA) / (L + SMOOTH_ALPHA * n)));
	const iMax = Math.max(...I);
	const x = I.map((v) => (iMax > 0 ? v / iMax : 0));
	let top = 0;
	for (let i = 1; i < n; i++) if (K[i] > K[top]) top = i;
	const xt = x[top];
	const u = x.map((v) => (xt < 1 ? Math.min(1, Math.max(0, (v - xt) / (1 - xt))) : 0));

	const q = L > 0 && n > 1 ? -Math.log(K[top] / L) / Math.log(n) : 0;
	const bottom = BOTTOM_SCALE * q;

	// targets: the game's scoring, and the same tiers re-dealt by count
	const scored = answers.map((a, i) => i).filter((i) => answers[i].gameScore !== null);
	const gW = scored.map((i) => K[i]);
	const [gameMean, gameSd] = weightedMoments(
		gW,
		scored.map((i) => answers[i].gameScore as number)
	);
	const byCount = [...scored].sort((p, r) => K[r] - K[p] || p - r);
	const tiers = scored.map((i) => answers[i].gameScore as number).sort((p, r) => p - r);
	const sortedScore = new Map<number, number>();
	byCount.forEach((i, k) => sortedScore.set(i, tiers[k]));
	const [sortedMean, sortedSd] = weightedMoments(
		gW,
		scored.map((i) => sortedScore.get(i) as number)
	);
	const targetMean = SPLIT_W * gameMean + (1 - SPLIT_W) * sortedMean;
	const targetSd = SPLIT_W * gameSd + (1 - SPLIT_W) * sortedSd;

	const pts = (a: number, b: number) => u.map((v) => bottom + (topScore - bottom) * kuma(v, a, b));
	const err = (a: number, b: number) => {
		const [m, sd] = weightedMoments(K, pts(a, b));
		const em = targetMean > 0 ? (m - targetMean) / targetMean : 0;
		const es = targetSd > 0 ? (sd - targetSd) / targetSd : 0;
		return 100 * em * em + es * es;
	};

	let a = 1,
		b = 1;
	if (L > 0 && targetMean > 0) {
		// coarse grid, then a shrinking pattern search (no shape limits: a, b > 0)
		let best = Infinity;
		for (const ga of geomspace(0.02, 30, 41))
			for (const gb of geomspace(0.02, 400, 41)) {
				const e = err(ga, gb);
				if (e < best) [best, a, b] = [e, ga, gb];
			}
		let s1 = a * 0.05,
			s2 = b * 0.05;
		for (let it = 0; it < 800 && Math.max(s1, s2) > 1e-9; it++) {
			let moved = false;
			for (const [d1, d2] of [
				[s1, 0],
				[-s1, 0],
				[0, s2],
				[0, -s2]
			]) {
				const na = a + d1,
					nb = b + d2;
				if (na < 1e-3 || nb < 1e-3) continue;
				const e = err(na, nb);
				if (e < best) {
					[best, a, b, moved] = [e, na, nb, true];
				}
			}
			if (!moved) {
				s1 /= 2;
				s2 /= 2;
			}
		}
	}

	const points = pts(a, b);
	const [fittedMean, fittedSd] = weightedMoments(K, points);
	return {
		points,
		fit: {
			a,
			b,
			q,
			bottom,
			gameMean,
			gameSd,
			sortedMean,
			sortedSd,
			targetMean,
			targetSd,
			fittedMean,
			fittedSd,
			top: topScore,
			breadth: breadth(answers)
		}
	};
}

// How broad a prompt is: sqrt(answers on it) / sum of squared shares. The
// denominator (the Herfindahl index) is near 1 when one answer takes everything
// and small when players spread out; sqrt(n) rewards a long list of options.
export function breadth(answers: ModelAnswer[]): number {
	const counts = answers.map((a) => Math.max(0, a.count));
	const total = counts.reduce((s, c) => s + c, 0);
	if (total <= 0 || !answers.length) return 0;
	const hhi = counts.reduce((s, c) => s + (c / total) ** 2, 0);
	return Math.sqrt(answers.length) / hhi;
}

// The all-time breadth range the tops are placed along.
export interface BreadthRange {
	min: number;
	max: number;
}

// Where breadth z sits between the all-time smallest x and largest y, on a LOG
// scale, as a top score: TOP_MIN + (TOP_MAX - TOP_MIN) x (ln z - ln x) / (ln y - ln x).
// Log because breadth spans orders of magnitude (31 to 103,890 by dive #82): on
// a straight line one record-breaking prompt squeezed every other prompt down to
// TOP_MIN. The range passed in is widened by these prompts first, so a new
// record lands exactly on an end.
export function topScores(prompts: ModelAnswer[][], range: BreadthRange | null = null): number[] {
	const b = prompts.map(breadth);
	const positive = b.filter((z) => z > 0);
	const lo = Math.min(range?.min ?? Infinity, ...positive);
	const hi = Math.max(range?.max ?? -Infinity, ...positive);
	return b.map((z) => {
		if (z <= 0) return TOP_MIN; // a prompt nobody answered
		if (!(hi > lo)) return (TOP_MIN + TOP_MAX) / 2;
		return (
			TOP_MIN + (TOP_MAX - TOP_MIN) * ((Math.log(z) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)))
		);
	});
}

// Score a whole day: every prompt's top from its breadth against the all-time
// range, then each prompt.
export function scoreDay(
	prompts: ModelAnswer[][],
	range: BreadthRange | null = null
): { points: number[]; fit: PromptFit }[] {
	const tops = topScores(prompts, range);
	return prompts.map((answers, i) => scorePrompt(answers, tops[i]));
}

// ---------------- matching a typed answer to the sheet ----------------

// Exact (case-insensitive) first, else the most-given answer that starts with it.
export function matchAnswer<T extends { answer: string; count: number }>(
	options: T[],
	typed: string
): T | null {
	const want = typed.trim().toLowerCase();
	if (!want) return null;
	const exact = options.find((o) => o.answer.toLowerCase() === want);
	if (exact) return exact;
	let best: T | null = null;
	for (const o of options) {
		if (o.answer.toLowerCase().startsWith(want) && (!best || o.count > best.count)) best = o;
	}
	return best;
}

// ---- Share text ----
//
// krillion.io's own share line is `Krillion #N 🦐 <score>  <7 tier emojis>`,
// one emoji per round by tier (each tier has fixed game points). The rescored
// share keeps that row and adds where each round landed after rescoring.

export const MISS_EMOJI = '⬛';

// Rarity percentile: the share of the day's players whose answer to the
// prompt was more common than yours, 0-100. The most-given answer is the 0th;
// an answer nobody else gave is just under the 100th.
export function rarityPercentile(
	count: number,
	counts: number[],
	total = counts.reduce((s, c) => s + c, 0)
): number | null {
	if (total <= 0) return null;
	let more = 0;
	for (const c of counts) if (c > count) more += c;
	return (100 * more) / total;
}

// "89.4%". Rounded down, so an answer nobody else gave reads 99.9%, never
// 100.0% -- that would claim it was rarer than itself.
export function formatPercentile(p: number): string {
	return `${(Math.floor(p * 10) / 10).toFixed(1)}%`;
}

// krillion.io's tiers: game points → emoji.
export const GAME_TIERS: { points: number; emoji: string; name: string }[] = [
	{ points: 10, emoji: '🫧', name: 'Plankton' },
	{ points: 15, emoji: '🤡', name: 'Too Clever' },
	{ points: 30, emoji: '🐟', name: 'Schooler' },
	{ points: 60, emoji: '🦑', name: 'Rare' },
	{ points: 85, emoji: '🏮', name: 'Deep Cut' },
	{ points: 100, emoji: '🌟', name: 'One in a Krillion' }
];

// Rescored points are continuous, so they're banded into tiers: roughly the
// midpoints between the game's tier points, with Deep Cut topping out at 95
// and One in a Krillion running 95-105, so it stays rare. Too Clever is
// left out -- it's krillion.io's hand-picked "famously obscure" label, not a
// rarity level, so rescoring can't land on it. Rescored tops reach 125, past
// anything the game gives, so 105+ gets a tier of its own: 💎.
export const RESCORED_TIERS: { min: number; emoji: string }[] = [
	{ min: 0, emoji: '🫧' },
	{ min: 20, emoji: '🐟' },
	{ min: 45, emoji: '🦑' },
	{ min: 72.5, emoji: '🏮' },
	{ min: 95, emoji: '🌟' },
	{ min: 105, emoji: '💎' }
];

export function gameEmoji(points: number | null, miss: boolean): string {
	if (miss || !points) return MISS_EMOJI;
	let best = GAME_TIERS[0];
	for (const t of GAME_TIERS) {
		if (Math.abs(t.points - points) < Math.abs(best.points - points)) best = t;
	}
	return best.emoji;
}

export function rescoredEmoji(points: number, miss: boolean): string {
	if (miss || points <= 0) return MISS_EMOJI;
	let emoji = RESCORED_TIERS[0].emoji;
	for (const t of RESCORED_TIERS) if (points >= t.min) emoji = t.emoji;
	return emoji;
}

// ➕ rescored higher than the game gave, ➖ lower, 🟰 the same (to the tenth).
export function changeEmoji(gamePoints: number | null, points: number): string {
	const diff = Math.round((points - (gamePoints ?? 0)) * 10);
	return diff > 0 ? '➕' : diff < 0 ? '➖' : '🟰';
}

export function rescoreShareText(
	dayNumber: number,
	gameScore: number | null,
	updatedScore: number,
	rounds: { gamePoints: number | null; points: number; miss: boolean }[]
): string {
	const row = (f: (r: (typeof rounds)[number]) => string) => rounds.map(f).join('');
	return [
		`Krillion #${dayNumber} 🦐 rescored`,
		`${gameScore ?? '—'} ➡️ ${updatedScore.toFixed(1)}`,
		'',
		row((r) => gameEmoji(r.gamePoints, r.miss)),
		row(() => '⬇️'),
		row((r) => rescoredEmoji(r.points, r.miss)),
		row((r) => changeEmoji(r.gamePoints, r.points))
	].join('\n');
}
