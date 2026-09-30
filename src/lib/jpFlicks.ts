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
	if (match.status === 'disallowed' || match.status === 'final') return false;
	if (viewer.isAdmin) return true;
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
