// src/lib/krillion.ts
// Krillion, rescored: everything that is pure and client-safe.
//
//   - reading a pasted end screen ("select all, copy" on krillion.io)
//   - dive number <-> date
//   - the scoring model itself: a continuous, count-based score per answer
//
// The model was worked out in a spreadsheet analysis of dives #79-80 (2026-10-02/03):
//   points = bottom + (TOP - bottom) * F(u; a, b),   F = 1 - (1 - u^a)^b  (Kumaraswamy CDF)
//   u      = surprisal relative to the prompt's most-given answer, scaled so the
//            most-given answer is 0 and the rarest is 1
//   bottom = BOTTOM_SCALE * q,  q = -ln(top share) / ln(answers on the prompt)
//   a, b   = fitted per prompt so that, picking answers in proportion to their
//            counts, the score's mean/SD equal a target: SPLIT_W x the game's own
//            scoring + (1 - SPLIT_W) x the game's tiers re-dealt by count.
// No cheater removal and no standings yet: both need the score histogram, which
// we don't request until Krillion's developer agrees.

export const TOP_SCORE = 110;
export const BOTTOM_SCALE = 20;
export const SPLIT_W = 0.25;
export const SMOOTH_ALPHA = 1;

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
	answer: string | null; // the game's matched answer; null on a miss
	typed: string | null; // what was typed, shown only on a miss
	miss: boolean;
	othersChose: number | null;
	gamePoints: number | null;
}

export interface PastedDive {
	dayNumber: number | null;
	score: number | null;
	betterThan: number | null;
	rounds: PastedRound[];
	complete: boolean; // all 7 rounds found
	totalMatchesScore: boolean; // the rounds add up to the score shown
}

const OTHERS_RE = /^([\d,]+)\s+other players? chose this$/i;

// The end screen copies as one item per line. Each round reads:
//   <round n>, <prompt>, <answer | "typed text" on a miss>, [<N> other players chose this], <points>, +
// Anything else on the page (menus, legend, shop link) is ignored.
export function parsePaste(text: string): PastedDive {
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

	const start = Math.max(
		0,
		lines.findIndex((l) => /^the catch$/i.test(l))
	);
	const rounds: PastedRound[] = [];
	for (let i = start; i < lines.length && rounds.length < 7; i++) {
		if (lines[i] !== String(rounds.length + 1)) continue;
		const prompt = lines[i + 1];
		if (!prompt || !/^name /i.test(prompt)) continue;
		let j = i + 2;
		const shown = lines[j++] ?? '';
		const quoted = /^".*"$/.test(shown) || shown === '?';
		let others: number | null = null;
		const m = (lines[j] ?? '').match(OTHERS_RE);
		if (m) {
			others = Number(m[1].replace(/,/g, ''));
			j++;
		}
		const points = /^\d{1,3}$/.test(lines[j] ?? '') ? Number(lines[j]) : null;
		rounds.push({
			round: rounds.length + 1,
			prompt,
			answer: quoted ? null : shown,
			typed: quoted && shown !== '?' ? shown.slice(1, -1) : null,
			miss: quoted || points === 0,
			othersChose: others,
			gamePoints: points
		});
		i = j;
	}

	const total = rounds.reduce((s, r) => s + (r.gamePoints ?? 0), 0);
	return {
		dayNumber,
		score,
		betterThan: better ? Number(better[1]) : null,
		rounds,
		complete: rounds.length === 7,
		totalMatchesScore: score !== null && total === score
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
export function scorePrompt(answers: ModelAnswer[]): { points: number[]; fit: PromptFit } {
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

	const pts = (a: number, b: number) => u.map((v) => bottom + (TOP_SCORE - bottom) * kuma(v, a, b));
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
			fittedSd
		}
	};
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
