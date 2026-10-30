// src/lib/jpFlicks.ts
// The league's vocabulary and its permission rules, in one client-safe place.
//
// The sentinel strings below are the contract between the database and the
// 3,000-odd lines of standings, forfeit and scheduling logic in
// /jpFlicks/+page.svelte, which still speak the spreadsheet's matrix dialect.
// The page declares its own copies as local constants; these are the ones the
// server renders with, and they must agree. They are here rather than in
// $lib/server so that both ends import the same strings.

export const UNPLAYED = 'UNPLAYED';
export const WONT_PLAY = 'XXX';
export const FORFEIT_WIN = 'F';
export const FORFEIT_LOSS = '-F';

export const SHEET_HOME = 'HomeGames';
export const SHEET_AWAY = 'AwayGames';
export const SHEET_TEAM_INFO = 'TeamInfo';

export type Venue = 'home' | 'away';
export type MatchStatus = 'unplayed' | 'disallowed' | 'pending' | 'final';
// How a season is scored. 'games' is seasons 1 and 2: a result is a margin and
// only the game counts. 'rounds' is season 3 on: every round counts too.
export type Scoring = 'games' | 'rounds';
// One round's scores, [team_a, team_b], the same point of view as margin.
export type Round = [number, number];
// A round in a game that is still being entered: a box nobody has filled in
// yet is null.
export type PartialRound = [number | null, number | null];

export interface Player {
	id: number;
	name: string;
	slot: number;
	userId: number | null;
	username: string | null;
}

export interface Team {
	id: number;
	name: string;
	sortOrder: number;
	tournamentPoints: number;
	players: Player[];
}

export interface Match {
	id: number;
	venue: Venue;
	teamA: number;
	teamB: number;
	status: MatchStatus;
	// Always from team_a's point of view. 0 is a tie, so nothing may test this
	// for truthiness.
	margin: number | null;
	// Round-by-round scores on a 'rounds' season; margin is their difference.
	// Null on a forfeit and on every result from a 'games' season. On an
	// unplayed match it is a game saved part-way through, which counts for
	// nothing until it is finished and sent.
	rounds: Round[] | PartialRound[] | null;
	// Who won the 20s shootout that settles a game level on points. Null unless
	// the round totals are equal.
	shootoutWinner: number | null;
	forfeitBy: number | null;
	submittedBy: number | null;
	submittedByName: string | null;
	// The side that entered a pending result. Null when nobody has, or when an
	// admin who doesn't play in the match entered it.
	submittedTeam: number | null;
	approvedBy: number | null;
}

export interface Season {
	slug: string;
	label: string;
	seasonNumber: number;
	isCurrent: boolean;
	// Discovery, not access. An unpublished season is left out of the tabs and
	// out of the default landing season for everyone but an admin, but it still
	// answers on its own URL. It is not a permission — see sql/023.
	isPublished: boolean;
	scoring: Scoring;
	homeVenue: string;
	awayVenue: string;
}

export interface Viewer {
	userId: number | null;
	username: string | null;
	isAdmin: boolean;
	// Teams in THIS season that the viewer plays for. Empty for a spectator, and
	// empty for everyone on an imported season, whose players were never linked
	// to accounts.
	teamIds: number[];
}

// site:admin implies this one, via hasRole().
export const JPFLICKS_ADMIN_ROLE = 'jpflicks:admin';

// --- the matrix ---

// One cell, from `perspective`'s point of view.
//
// A pending result deliberately renders as UNPLAYED: one side has entered a
// score and the other has not agreed to it, and an unconfirmed score must not
// reach the standings. It is surfaced separately, as something to approve.
export function cellFor(match: Match, perspective: number): string | number {
	if (match.status === 'disallowed') return WONT_PLAY;
	if (match.status !== 'final') return UNPLAYED;

	const flip = perspective === match.teamB;
	if (match.forfeitBy !== null) {
		return match.forfeitBy === perspective ? FORFEIT_LOSS : FORFEIT_WIN;
	}
	const m = match.margin ?? 0;
	return flip ? -m : m;
}

// --- who may do what ---

// Results are entered by the people who played. A past season is read-only to
// players — it is history — but stays open to an admin, who is the one who has
// to fix a mis-entered score from three months ago.
export function canPlayersAct(season: Season): boolean {
	return season.isCurrent;
}

export function playsIn(viewer: Viewer, match: Match): boolean {
	return viewer.teamIds.includes(match.teamA) || viewer.teamIds.includes(match.teamB);
}

export function teamOf(viewer: Viewer, match: Match): number | null {
	if (viewer.teamIds.includes(match.teamA)) return match.teamA;
	if (viewer.teamIds.includes(match.teamB)) return match.teamB;
	return null;
}

// Entering a score. Either side of the match may be the one to do it.
export function canSubmit(season: Season, viewer: Viewer, match: Match): boolean {
	if (match.status === 'disallowed') return false;
	// An agreed result is settled for the players, but an admin can still
	// correct it: that is what the admin Change buttons are for.
	if (viewer.isAdmin) return true;
	if (match.status === 'final') return false;
	if (!canPlayersAct(season)) return false;
	if (!playsIn(viewer, match)) return false;
	// While a result is pending, only the side that entered it may change it;
	// the other side's move is to approve or reject.
	if (match.status === 'pending') return match.submittedBy === viewer.userId;
	return true;
}

// Agreeing to a score somebody else entered.
//
// The approver must be on the OPPOSING team — the point of the step is that the
// person with a reason to object is the one signing off, which a teammate is
// not. An admin may also approve, as the tiebreak when the other side is slow
// or absent.
export function canApprove(season: Season, viewer: Viewer, match: Match): boolean {
	if (match.status !== 'pending') return false;
	if (match.submittedBy === viewer.userId) return false; // never your own
	if (viewer.isAdmin) return true;
	if (!canPlayersAct(season)) return false;
	if (!playsIn(viewer, match)) return false;

	// Anyone on the side that entered it is a teammate of the submitter, so they
	// are not an independent check. An admin-entered pending result has no side,
	// and either team may then agree to it.
	const mine = teamOf(viewer, match);
	return mine !== null && mine !== match.submittedTeam;
}

// Rejecting sends it back to unplayed. Same people as approval.
export const canReject = canApprove;

// --- formatting ---

export function describeResult(match: Match, teamNames: Map<number, string>): string {
	const a = teamNames.get(match.teamA) ?? '?';
	const b = teamNames.get(match.teamB) ?? '?';
	if (match.status === 'disallowed') return 'not played — shared player';
	if (match.status === 'unplayed') return 'not yet played';

	if (match.forfeitBy !== null) {
		const loser = teamNames.get(match.forfeitBy) ?? '?';
		const winner = match.forfeitBy === match.teamA ? b : a;
		return `${winner} won by forfeit (${loser} forfeited)`;
	}
	const m = match.margin ?? 0;
	if (m === 0) return `${a} and ${b} tied`;
	return m > 0 ? `${a} by ${m}` : `${b} by ${-m}`;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

// A result as the form produces it: either a margin with a winner, or a forfeit.
export function checkResult(input: {
	kind: unknown;
	margin: unknown;
	winner: unknown;
	forfeitBy: unknown;
	teamA: number;
	teamB: number;
}): Checked<{ margin: number | null; forfeitBy: number | null }> {
	if (input.kind === 'forfeit') {
		const by = Number(input.forfeitBy);
		if (by !== input.teamA && by !== input.teamB) {
			return { ok: false, error: 'Say which team forfeited.' };
		}
		return { ok: true, value: { margin: null, forfeitBy: by } };
	}

	if (input.kind !== 'margin') return { ok: false, error: 'A result is a margin or a forfeit.' };

	const size = Number(String(input.margin ?? '').trim());
	if (!Number.isFinite(size) || !Number.isInteger(size)) {
		return { ok: false, error: 'The margin has to be a whole number.' };
	}
	if (size < 0)
		return { ok: false, error: 'Enter the margin as a positive number, and pick the winner.' };
	if (size > 500) return { ok: false, error: 'That margin looks wrong (over 500).' };

	// A tie needs no winner; anything else does.
	if (size === 0) return { ok: true, value: { margin: 0, forfeitBy: null } };

	const winner = Number(input.winner);
	if (winner !== input.teamA && winner !== input.teamB) {
		return { ok: false, error: 'Pick the winning team.' };
	}
	// Stored from team_a's point of view.
	return { ok: true, value: { margin: winner === input.teamA ? size : -size, forfeitBy: null } };
}

// --- round scoring (season 3 on) ---
//
// Every game plays all 4 rounds. A round win is 1 point, winning the game (the
// higher total over the 4 rounds) is 2 more, and winning the series (both games
// against a team, totals combined) is 2. Rounds and series can be drawn, at half
// a win to each side. A game cannot: level on points, it goes to a 20s shootout
// and the shootout's winner wins the game. The rules copy on the page states
// these numbers.

export const ROUNDS_PER_GAME = 4;
export const ROUND_WIN_POINTS = 1;
export const GAME_WIN_POINTS = 2;
export const SERIES_WIN_POINTS = 2;
const MAX_ROUND_SCORE = 500;
// Discs score 5, 10, 15 or 20, so every round score is a multiple of 5.
export const SCORE_STEP = 5;
// One lopsided game shouldn't swamp the point differential, so a game counts
// for at most this much either way in the +/-. The game and series results
// still use the real scores.
export const GAME_DIFF_CAP = 100;

export function cappedDiff(margin: number): number {
	return Math.max(-GAME_DIFF_CAP, Math.min(GAME_DIFF_CAP, margin));
}

// The round grid as the form sends it, [[a, b], ...] in team_a's view, read
// box by box: null for a blank box, an error for anything that isn't a score.
function readRounds(input: unknown): Checked<PartialRound[]> {
	if (!Array.isArray(input) || input.length !== ROUNDS_PER_GAME) {
		return { ok: false, error: `Enter the score for all ${ROUNDS_PER_GAME} rounds.` };
	}
	const rounds: PartialRound[] = [];
	for (const [i, pair] of input.entries()) {
		if (!Array.isArray(pair) || pair.length !== 2) {
			return { ok: false, error: `Round ${i + 1} needs a score for both teams.` };
		}
		const [a, b] = pair.map((v) => {
			const s = String(v ?? '').trim();
			return s === '' ? null : Number(s);
		});
		for (const n of [a, b]) {
			if (n === null) continue;
			if (!Number.isInteger(n) || n < 0) {
				return { ok: false, error: `Round ${i + 1}: scores are whole numbers, 0 or more.` };
			}
			if (n % SCORE_STEP !== 0) {
				return {
					ok: false,
					error: `Round ${i + 1}: scores go up in ${SCORE_STEP}s, so ${n} can't be right.`
				};
			}
			if (n > MAX_ROUND_SCORE) {
				return {
					ok: false,
					error: `Round ${i + 1}: that score looks wrong (over ${MAX_ROUND_SCORE}).`
				};
			}
		}
		rounds.push([a, b]);
	}
	return { ok: true, value: rounds };
}

// Whether a round has a score. Usually only one side scores in a round, so
// with one team on points the other's blank box is 0. A 0-0 round needs both
// 0s typed, so a round that was simply skipped can't pass for one.
export function roundEntered([a, b]: PartialRound): boolean {
	if (a !== null && b !== null) return true;
	const only = a ?? b;
	return only !== null && only > 0;
}

// A game saved part-way through, to finish later. Any rounds may be filled in
// or not; an all-blank grid clears the saved game.
export function checkProgress(input: unknown): Checked<{ rounds: PartialRound[] | null }> {
	const read = readRounds(input);
	if (!read.ok) return read;
	const empty = read.value.every(([a, b]) => a === null && b === null);
	return { ok: true, value: { rounds: empty ? null : read.value } };
}

// A finished game: all four rounds, plus the shootout winner, which is asked
// for only when the totals are level.
export function checkRounds(
	input: unknown,
	shootout: unknown,
	teamA: number,
	teamB: number
): Checked<{ rounds: Round[]; margin: number; shootoutWinner: number | null }> {
	const read = readRounds(input);
	if (!read.ok) return read;
	const rounds: Round[] = [];
	for (const [i, round] of read.value.entries()) {
		if (!roundEntered(round)) {
			const error =
				round[0] === null && round[1] === null
					? `Round ${i + 1} has no score. For a 0-0 round, enter 0 for both teams.`
					: `Round ${i + 1}: for a 0-0 round, enter 0 for both teams.`;
			return { ok: false, error };
		}
		rounds.push([round[0] ?? 0, round[1] ?? 0]);
	}
	const margin = rounds.reduce((sum, [a, b]) => sum + a - b, 0);
	if (margin !== 0) return { ok: true, value: { rounds, margin, shootoutWinner: null } };

	const winner = Number(shootout);
	if (winner !== teamA && winner !== teamB) {
		return { ok: false, error: "It's level on points. Say who won the 20s shootout." };
	}
	return { ok: true, value: { rounds, margin, shootoutWinner: winner } };
}

export interface Record3 {
	w: number;
	d: number;
	l: number;
}

export interface RoundStanding {
	rounds: Record3;
	games: Record3;
	series: Record3;
	points: number;
}

const tally = (r: Record3, diff: number, count = 1) => {
	if (diff > 0) r.w += count;
	else if (diff < 0) r.l += count;
	else r.d += count;
};

// The rounds, games and series records for each team, keyed by team id, and
// the league points they earn (tournament points not included).
//
// Only agreed results count, as everywhere else. A forfeit is all 4 rounds and
// the game to the side that turned up, and counts towards the series as a win
// by `forfeitMargin`, the same figure the point differential uses.
export function roundStandings(
	teamIds: number[],
	matches: Match[],
	forfeitMargin: number
): Map<number, RoundStanding> {
	const out = new Map<number, RoundStanding>();
	const blank = () => ({ w: 0, d: 0, l: 0 });
	for (const id of teamIds) {
		out.set(id, { rounds: blank(), games: blank(), series: blank(), points: 0 });
	}

	// Combined margin per pairing, in team_a's view, once both games are in.
	const pairs = new Map<string, { a: number; b: number; margin: number; games: number }>();

	for (const m of matches) {
		if (m.status !== 'final') continue;
		const a = out.get(m.teamA);
		const b = out.get(m.teamB);
		if (!a || !b) continue;

		let margin: number;
		if (m.forfeitBy !== null) {
			margin = m.forfeitBy === m.teamB ? forfeitMargin : -forfeitMargin;
			tally(a.rounds, margin, ROUNDS_PER_GAME);
			tally(b.rounds, -margin, ROUNDS_PER_GAME);
		} else {
			margin = m.margin ?? 0;
			for (const [ra, rb] of (m.rounds ?? []) as Round[]) {
				tally(a.rounds, ra - rb);
				tally(b.rounds, rb - ra);
			}
		}
		// Level on points means the shootout decided it.
		const decided =
			margin !== 0
				? margin
				: m.shootoutWinner === m.teamA
					? 1
					: m.shootoutWinner === m.teamB
						? -1
						: 0;
		tally(a.games, decided);
		tally(b.games, -decided);

		const key = `${m.teamA}:${m.teamB}`;
		const pair = pairs.get(key) ?? { a: m.teamA, b: m.teamB, margin: 0, games: 0 };
		pair.margin += margin;
		pair.games += 1;
		pairs.set(key, pair);
	}

	for (const p of pairs.values()) {
		if (p.games < 2) continue;
		tally(out.get(p.a)!.series, p.margin);
		tally(out.get(p.b)!.series, -p.margin);
	}

	const worth = (r: Record3, win: number) => win * r.w + (win / 2) * r.d;
	for (const s of out.values()) {
		s.points =
			worth(s.rounds, ROUND_WIN_POINTS) +
			worth(s.games, GAME_WIN_POINTS) +
			worth(s.series, SERIES_WIN_POINTS);
	}
	return out;
}
