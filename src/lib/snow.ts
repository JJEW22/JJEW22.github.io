// src/lib/snow.ts
// Dates, ranking and the visibility rules for the first-snow predictions.
//
// Client-safe on purpose: the page, the admin page and the endpoints all import
// from here, so what the browser draws and what the server is willing to send
// are decided by the same functions. The server is still the one that enforces
// it — canSeeAll() is applied there before a date ever reaches the wire.
//
// Every date in this module is a 'YYYY-MM-DD' string parsed at UTC midnight.
// The old page mixed `new Date("2025-12-15")` (UTC) with `new Date(y, m-1, d)`
// (local) and the two differ by a day west of Greenwich, which is what put a
// workaround date into actualSnowDate and named the wrong winner.

import { checkName } from '$lib/names';

export const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SnowSeason {
	slug: string;
	label: string;
	deadline: string | null; // last day a prediction may be added or changed
	firstSnow: string | null; // null until it actually snows
	isCurrent: boolean;
}

export interface SnowPrediction {
	id: number;
	name: string;
	// Null when the viewer isn't allowed to see it yet. The row still appears, so
	// you can tell who is in without learning what they picked.
	date: string | null;
	isYou: boolean;
	userId: number | null;
}

export interface Viewer {
	username: string | null;
	isAdmin: boolean;
	hasSubmitted: boolean;
}

// --- dates ---

// Milliseconds at UTC midnight, or NaN if it isn't a date.
export function parseDay(day: string | null | undefined): number {
	if (!day || !DATE_RE.test(day)) return NaN;
	const ms = Date.parse(`${day}T00:00:00Z`);
	return Number.isNaN(ms) ? NaN : ms;
}

export function toDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function isDay(day: string | null | undefined): boolean {
	return !Number.isNaN(parseDay(day));
}

// Today in the reader's own timezone, expressed as a plain day. Built from local
// components rather than toISOString(), which would roll over at 7pm in Boston.
export function todayISO(now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function daysBetween(from: string, to: string): number {
	return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

export function formatDay(day: string | null, style: 'long' | 'short' = 'long'): string {
	if (!isDay(day)) return '—';
	return new Date(parseDay(day as string)).toLocaleDateString('en-US', {
		month: style === 'long' ? 'long' : 'short',
		day: 'numeric',
		...(style === 'long' ? { year: 'numeric' } : {}),
		timeZone: 'UTC'
	});
}

export function daysText(days: number): string {
	if (days === 0) return 'Today!';
	if (days === 1) return 'Tomorrow';
	if (days === -1) return 'Yesterday';
	if (days < 0) return `${Math.abs(days)} days ago`;
	return `In ${days} days`;
}

// --- the rules ---

// A season locks when the snow has been recorded, or once the deadline has
// passed. The deadline day itself is still open, which is why this is `>`.
export function seasonLocked(season: SnowSeason, today: string = todayISO()): boolean {
	if (season.firstSnow) return true;
	if (!season.deadline) return false;
	return daysBetween(season.deadline, today) > 0;
}

// Who may see everybody's dates.
//
// Until the season locks, nobody sees a pick but their own — otherwise the last
// person to submit could just pick the gap. The one exception is an admin who
// has already submitted: they need the full list to enter picks on other
// people's behalf, and having their own pick in first (and frozen, see
// canEditOwn) is what makes that safe.
export function canSeeAll(season: SnowSeason, viewer: Viewer, today: string = todayISO()): boolean {
	if (seasonLocked(season, today)) return true;
	return viewer.isAdmin && viewer.hasSubmitted;
}

// Whether this viewer may still add or change their OWN prediction.
//
// An admin's pick freezes the moment they submit it, because that submission is
// what opens everyone else's picks to them. Changing it afterwards would be
// picking with the answers in front of you. Ordinary users can revise freely
// until the season locks.
export function canEditOwn(
	season: SnowSeason,
	viewer: Viewer,
	today: string = todayISO()
): boolean {
	if (seasonLocked(season, today)) return false;
	if (viewer.isAdmin && viewer.hasSubmitted) return false;
	return true;
}

// Whether this viewer may enter or amend predictions for other people.
export function canManageOthers(
	season: SnowSeason,
	viewer: Viewer,
	today: string = todayISO()
): boolean {
	if (seasonLocked(season, today)) return false;
	return viewer.isAdmin && viewer.hasSubmitted;
}

// --- ranking ---

export interface Ranked extends SnowPrediction {
	date: string; // ranking only ever runs on revealed predictions
	daysOff: number; // absolute distance from the target day
	signedDays: number; // negative = predicted before it happened
	rank: number; // competition style: 1, 1, 3
}

// Predictions ordered by how close they are to `target`, which is the snow date
// once it has fallen and today's date while the season is still running — "who
// would win if it snowed right now" is the same question either way.
export function rankPredictions(predictions: SnowPrediction[], target: string): Ranked[] {
	const dated = predictions.filter((p): p is SnowPrediction & { date: string } => isDay(p.date));
	const scored = dated.map((p) => ({
		...p,
		signedDays: daysBetween(target, p.date),
		daysOff: Math.abs(daysBetween(target, p.date))
	}));
	// Ties broken by name so the order is stable between reloads rather than
	// whatever order the rows arrived in.
	scored.sort((a, b) => a.daysOff - b.daysOff || a.name.localeCompare(b.name));

	let rank = 0;
	let previous: number | null = null;
	return scored.map((p, i) => {
		if (previous === null || p.daysOff !== previous) rank = i + 1;
		previous = p.daysOff;
		return { ...p, rank };
	});
}

export interface WinRange {
	start: string | null; // null = from the beginning of time
	end: string | null; // null = until the end of time
}

// The days on which each prediction wins OUTRIGHT, as whole days.
//
// The boundary between two neighbouring picks is their midpoint. When the gap
// between them is even the midpoint lands on a real day that both are equally
// close to, so that day belongs to neither range — it is a tie, and leaving it
// out of both is the honest answer. The old version nudged hours around to
// paper over the same problem.
export function winningRanges(predictions: SnowPrediction[]): Map<number, WinRange> {
	const dated = predictions
		.filter((p): p is SnowPrediction & { date: string } => isDay(p.date))
		.sort((a, b) => parseDay(a.date) - parseDay(b.date));

	const ranges = new Map<number, WinRange>();
	for (let i = 0; i < dated.length; i++) {
		const mine = parseDay(dated[i].date) / DAY_MS;

		let start: string | null = null;
		// Walk back past anyone who picked the same day: they share a range.
		let before = i - 1;
		while (before >= 0 && dated[before].date === dated[i].date) before--;
		if (before >= 0) {
			const theirs = parseDay(dated[before].date) / DAY_MS;
			start = toDay((Math.floor((mine + theirs) / 2) + 1) * DAY_MS);
		}

		let end: string | null = null;
		let after = i + 1;
		while (after < dated.length && dated[after].date === dated[i].date) after++;
		if (after < dated.length) {
			const theirs = parseDay(dated[after].date) / DAY_MS;
			end = toDay((Math.ceil((mine + theirs) / 2) - 1) * DAY_MS);
		}

		ranges.set(dated[i].id, { start, end });
	}
	return ranges;
}

export function formatRange(range: WinRange | undefined): string {
	if (!range) return '—';
	if (!range.start && !range.end) return 'Always';
	if (!range.start) return `On or before ${formatDay(range.end, 'short')}`;
	if (!range.end) return `On or after ${formatDay(range.start, 'short')}`;
	if (range.start === range.end) return formatDay(range.start, 'short');
	return `${formatDay(range.start, 'short')} – ${formatDay(range.end, 'short')}`;
}

// --- validation, shared by the form and the endpoints ---

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkPrediction(
	name: unknown,
	date: unknown
): Checked<{ name: string; date: string }> {
	const named = checkName(name);
	if (!named.ok) {
		const empty = typeof name !== 'string' || !name.trim();
		return { ok: false, error: empty ? 'A prediction needs a name.' : named.error };
	}
	const trimmed = named.value;

	const day = typeof date === 'string' ? date.trim() : '';
	if (!isDay(day)) return { ok: false, error: 'Pick a date in YYYY-MM-DD form.' };

	return { ok: true, value: { name: trimmed, date: day } };
}
