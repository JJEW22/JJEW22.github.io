// src/lib/server/pizzaBracket.ts
// Read the pizza bracket out of the database and work out where it stands.
//
// Two things happen here that used to happen in processPizzaRatings.py:
//
//   1. ADVANCEMENT IS DERIVED. A slot that names a source match holds no team of
//      its own — whoever wins that match occupies it, computed on every read. The
//      script used to write winners forward into the JSON, which meant the file
//      carried state that had to be regenerated to stay true.
//   2. WINNERS ARE DERIVED. Ratings are the only stored input; the winner comes
//      from $lib/pizzaScoring, the same module the admin grid previews with. An
//      explicit override is the one exception, for a matchup nobody rated or a
//      perfect tie.
//
// Nothing in this module writes.

import { sql } from '$lib/server/db';
import { scoreMatch, type Entrant, type MatchResult } from '$lib/pizzaScoring';

export interface PizzaTeam {
	id: number;
	name: string;
}

export interface PizzaVoter {
	id: number;
	name: string;
}

export interface PizzaDivision {
	id: number;
	name: string;
	color: string | null;
	sortOrder: number;
}

export interface ResolvedSlot {
	id: number;
	slotIndex: number;
	// Who is actually standing here, once sources are followed. Null while the
	// feeding match is undecided.
	teamId: number | null;
	seed: number | null;
	sourceMatchKey: string | null;
	isBye: boolean;
	votes: number | null;
	// Null rather than 0 when this team drew no ratings in this match — 0 would
	// read as "everybody hated it".
	rating: number | null;
}

export interface ResolvedMatch {
	id: number;
	matchKey: string;
	divisionId: number | null;
	roundName: string;
	roundOrder: number;
	sortOrder: number;
	kind: 'standard' | 'triple';
	slots: ResolvedSlot[];
	winnerTeamId: number | null;
	// True when winnerTeamId came from an admin, not from the ratings.
	overridden: boolean;
	overrideNote: string | null;
	// What the ratings alone say, even when an override is in force — so the admin
	// page can show what it is overruling.
	computedWinnerTeamId: number | null;
	tied: boolean;
	ignoredRatings: number;
	ratingCount: number;
}

// matchId -> teamId -> voterId -> rating
export type RatingIndex = Map<number, Map<number, Record<number, number>>>;

export interface LoadedBracket {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	teams: PizzaTeam[];
	teamsById: Map<number, PizzaTeam>;
	voters: PizzaVoter[];
	divisions: PizzaDivision[];
	matches: ResolvedMatch[];
	matchesByKey: Map<string, ResolvedMatch>;
	ratings: RatingIndex;
}

interface MatchRow {
	id: number;
	division_id: number | null;
	round_name: string;
	round_order: number;
	match_key: string;
	kind: string;
	sort_order: number;
	winner_override_team_id: number | null;
	override_note: string | null;
}

interface SlotRow {
	id: number;
	match_id: number;
	slot_index: number;
	team_id: number | null;
	seed: number | null;
	source_match_id: number | null;
	is_bye: boolean;
}

// postgres.js hands back int8 and numeric as strings; the rest of the app coerces
// at the boundary (see auth.ts, scoring.ts) and so does this.
function num(value: unknown): number {
	return Number(value);
}
function numOrNull(value: unknown): number | null {
	return value === null || value === undefined ? null : Number(value);
}

export async function loadBracket(slug?: string): Promise<LoadedBracket | null> {
	const bracketRows = slug
		? await sql`select id, slug, name, description from pizza_brackets where slug = ${slug}`
		: await sql`
				select id, slug, name, description
				from pizza_brackets
				where is_active
				order by id
				limit 1
			`;
	const bracketRow = bracketRows[0];
	if (!bracketRow) return null;
	const bracketId = num(bracketRow.id);

	const [teamRows, divisionRows, matchRows, slotRows, voterRows, ratingRows] = await Promise.all([
		sql`select id, name from pizza_teams where bracket_id = ${bracketId} order by id`,
		sql`
			select id, name, color, sort_order
			from pizza_divisions
			where bracket_id = ${bracketId}
			order by sort_order, id
		`,
		sql`
			select id, division_id, round_name, round_order, match_key, kind, sort_order,
			       winner_override_team_id, override_note
			from pizza_matches
			where bracket_id = ${bracketId}
			order by round_order, sort_order, id
		`,
		sql`
			select s.id, s.match_id, s.slot_index, s.team_id, s.seed, s.source_match_id, s.is_bye
			from pizza_slots s
			join pizza_matches m on m.id = s.match_id
			where m.bracket_id = ${bracketId}
			order by s.match_id, s.slot_index
		`,
		sql`
			select id, name from pizza_voters where bracket_id = ${bracketId} order by sort_order, id
		`,
		sql`
			select r.match_id, r.team_id, r.voter_id, r.rating
			from pizza_ratings r
			join pizza_matches m on m.id = r.match_id
			where m.bracket_id = ${bracketId}
		`
	]);

	const teams: PizzaTeam[] = teamRows.map((r) => ({ id: num(r.id), name: r.name as string }));
	const teamsById = new Map(teams.map((t) => [t.id, t]));

	const voters: PizzaVoter[] = voterRows.map((r) => ({ id: num(r.id), name: r.name as string }));

	const divisions: PizzaDivision[] = divisionRows.map((r) => ({
		id: num(r.id),
		name: r.name as string,
		color: (r.color as string | null) ?? null,
		sortOrder: num(r.sort_order)
	}));

	const ratings: RatingIndex = new Map();
	for (const r of ratingRows) {
		const matchId = num(r.match_id);
		const teamId = num(r.team_id);
		if (!ratings.has(matchId)) ratings.set(matchId, new Map());
		const byTeam = ratings.get(matchId)!;
		if (!byTeam.has(teamId)) byTeam.set(teamId, {});
		byTeam.get(teamId)![num(r.voter_id)] = num(r.rating);
	}

	const matches = resolve(
		matchRows as unknown as MatchRow[],
		slotRows as unknown as SlotRow[],
		ratings
	);

	return {
		id: bracketId,
		slug: bracketRow.slug as string,
		name: bracketRow.name as string,
		description: (bracketRow.description as string | null) ?? null,
		teams,
		teamsById,
		voters,
		divisions,
		matches,
		matchesByKey: new Map(matches.map((m) => [m.matchKey, m])),
		ratings
	};
}

// Walk the bracket, following sources and scoring as it goes.
//
// Recursive with memoisation rather than a single ordered pass: round_order almost
// always puts a source before its consumer, but nothing in the schema guarantees it,
// and a play-in feeding a same-round match is a shape someone will eventually build
// in the admin page. The `resolving` set turns a miswired cycle into an undecided
// match instead of a stack overflow.
function resolve(
	matchRows: MatchRow[],
	slotRows: SlotRow[],
	ratings: RatingIndex
): ResolvedMatch[] {
	const rowById = new Map(matchRows.map((m) => [num(m.id), m]));
	const keyById = new Map(matchRows.map((m) => [num(m.id), m.match_key]));

	const slotsByMatch = new Map<number, SlotRow[]>();
	for (const s of slotRows) {
		const matchId = num(s.match_id);
		if (!slotsByMatch.has(matchId)) slotsByMatch.set(matchId, []);
		slotsByMatch.get(matchId)!.push(s);
	}

	const done = new Map<number, ResolvedMatch>();
	const resolving = new Set<number>();

	function build(matchId: number): ResolvedMatch | null {
		const cached = done.get(matchId);
		if (cached) return cached;

		const row = rowById.get(matchId);
		if (!row) return null;

		const rows = slotsByMatch.get(matchId) ?? [];
		const override = numOrNull(row.winner_override_team_id);

		// Occupants first. A source is followed only if we are not already inside it.
		const occupants: (number | null)[] = rows.map((s) => {
			const direct = numOrNull(s.team_id);
			if (direct !== null) return direct;
			const sourceId = numOrNull(s.source_match_id);
			if (sourceId === null || resolving.has(sourceId)) return null;
			resolving.add(matchId);
			const source = build(sourceId);
			resolving.delete(matchId);
			return source?.winnerTeamId ?? null;
		});

		const byMatch = ratings.get(matchId);
		const ratingCount = byMatch
			? [...byMatch.values()].reduce((sum, r) => sum + Object.keys(r).length, 0)
			: 0;

		// A matchup with an empty slot has no one to score against, so it stays open
		// unless an admin has called it.
		const known = occupants.every((teamId) => teamId !== null);
		const entrants: Entrant[] = known
			? occupants.map((teamId) => ({
					teamId: teamId as number,
					ratings: byMatch?.get(teamId as number) ?? {}
				}))
			: [];

		const kind = row.kind === 'triple' ? 'triple' : 'standard';
		const scored: MatchResult | null = entrants.length ? scoreMatch(kind, entrants) : null;
		const resultByTeam = new Map((scored?.results ?? []).map((r) => [r.teamId, r]));

		const match: ResolvedMatch = {
			id: matchId,
			matchKey: row.match_key,
			divisionId: numOrNull(row.division_id),
			roundName: row.round_name,
			roundOrder: num(row.round_order),
			sortOrder: num(row.sort_order),
			kind,
			slots: rows.map((s, i) => {
				const teamId = occupants[i];
				const result = teamId !== null ? resultByTeam.get(teamId) : undefined;
				const hasRatings = teamId !== null && Object.keys(byMatch?.get(teamId) ?? {}).length > 0;
				const sourceId = numOrNull(s.source_match_id);
				return {
					id: num(s.id),
					slotIndex: num(s.slot_index),
					teamId,
					seed: numOrNull(s.seed),
					sourceMatchKey: sourceId === null ? null : (keyById.get(sourceId) ?? null),
					isBye: Boolean(s.is_bye),
					votes: result?.votes ?? null,
					rating: hasRatings ? (result?.rating ?? null) : null
				};
			}),
			winnerTeamId: override ?? scored?.winnerTeamId ?? null,
			overridden: override !== null,
			overrideNote: row.override_note,
			computedWinnerTeamId: scored?.winnerTeamId ?? null,
			tied: scored?.tied ?? false,
			ignoredRatings: scored?.ignoredRatings ?? 0,
			ratingCount
		};

		done.set(matchId, match);
		return match;
	}

	// Built in listed order so the returned array keeps round/sort order, even though
	// build() may have filled some in early via a source.
	return matchRows.map((m) => build(num(m.id))).filter((m): m is ResolvedMatch => m !== null);
}

// ---------- the shape PizzaBracket.svelte renders ----------
//
// Deliberately identical to static/pizzaBracket/pizzaBracket.json: the component
// indexes division.rounds[0..2], filters round 0 on match.type, reads team.source
// === 'bye' for styling, and expects match.winner to be a NAME. Keeping the
// contract means the component needs one line changed, and the static file stays
// usable as a fallback.

export interface BracketJsonTeam {
	name: string;
	seed: number | null;
	source?: string;
	votes: number | null;
	rating: number | null;
}

export interface BracketJsonMatch {
	id: string;
	type: string;
	teams: BracketJsonTeam[];
	winner: string | null;
}

export interface BracketJson {
	bracketName: string;
	description: string | null;
	divisions: {
		name: string;
		color: string | null;
		rounds: { name: string; matches: BracketJsonMatch[] }[];
	}[];
	finals: { rounds: { name: string; matches: BracketJsonMatch[] }[] };
}

function toJsonMatch(match: ResolvedMatch, teamsById: Map<number, PizzaTeam>): BracketJsonMatch {
	return {
		id: match.matchKey,
		type: match.kind,
		teams: match.slots.map((slot) => {
			const team: BracketJsonTeam = {
				name: slot.teamId !== null ? (teamsById.get(slot.teamId)?.name ?? 'TBD') : 'TBD',
				seed: slot.seed,
				votes: slot.votes,
				rating: slot.rating
			};
			if (slot.isBye) team.source = 'bye';
			else if (slot.sourceMatchKey) team.source = slot.sourceMatchKey;
			return team;
		}),
		winner: match.winnerTeamId !== null ? (teamsById.get(match.winnerTeamId)?.name ?? null) : null
	};
}

// Group a division's (or the finals') matches into rounds, in round_order.
function groupRounds(matches: ResolvedMatch[], teamsById: Map<number, PizzaTeam>) {
	const rounds: { name: string; order: number; matches: BracketJsonMatch[] }[] = [];
	const byName = new Map<string, (typeof rounds)[number]>();

	for (const match of matches) {
		let round = byName.get(match.roundName);
		if (!round) {
			round = { name: match.roundName, order: match.roundOrder, matches: [] };
			byName.set(match.roundName, round);
			rounds.push(round);
		}
		round.matches.push(toJsonMatch(match, teamsById));
	}

	return rounds
		.sort((a, b) => a.order - b.order)
		.map(({ name, matches: roundMatches }) => ({ name, matches: roundMatches }));
}

// ---------- the shape /pizzaBracket/admin edits ----------
//
// Everything the grid needs in one round trip: the roster, the voters, and every
// match with its ratings already indexed. Sent whole after each write so the page
// never has to re-derive a winner the server just recomputed.

export interface AdminSlot {
	slotIndex: number;
	teamId: number | null;
	teamName: string | null;
	seed: number | null;
	sourceMatchKey: string | null;
	isBye: boolean;
	votes: number | null;
	rating: number | null;
}

export interface AdminMatch {
	id: number;
	matchKey: string;
	kind: 'standard' | 'triple';
	divisionId: number | null;
	divisionName: string | null;
	roundName: string;
	slots: AdminSlot[];
	// Every slot has someone in it, so there is something to rate. A match that is
	// not ready is waiting on an earlier result, not on votes.
	ready: boolean;
	winnerTeamId: number | null;
	computedWinnerTeamId: number | null;
	overridden: boolean;
	overrideNote: string | null;
	tied: boolean;
	ignoredRatings: number;
	ratingCount: number;
	// teamId -> voterId -> rating, both keys stringified by JSON.
	ratings: Record<string, Record<string, number>>;
}

export interface AdminState {
	bracket: { id: number; slug: string; name: string; description: string | null };
	teams: PizzaTeam[];
	voters: PizzaVoter[];
	divisions: PizzaDivision[];
	rounds: { name: string; order: number; matches: AdminMatch[] }[];
}

export function toAdminJson(bracket: LoadedBracket): AdminState {
	const { teamsById } = bracket;
	const divisionsById = new Map(bracket.divisions.map((d) => [d.id, d]));

	const rounds: AdminState['rounds'] = [];
	const byName = new Map<string, AdminState['rounds'][number]>();

	for (const match of bracket.matches) {
		let round = byName.get(match.roundName);
		if (!round) {
			round = { name: match.roundName, order: match.roundOrder, matches: [] };
			byName.set(match.roundName, round);
			rounds.push(round);
		}

		const ratings: Record<string, Record<string, number>> = {};
		for (const [teamId, byVoter] of bracket.ratings.get(match.id) ?? new Map()) {
			ratings[String(teamId)] = Object.fromEntries(
				Object.entries(byVoter as Record<number, number>)
			);
		}

		round.matches.push({
			id: match.id,
			matchKey: match.matchKey,
			kind: match.kind,
			divisionId: match.divisionId,
			divisionName:
				match.divisionId !== null ? (divisionsById.get(match.divisionId)?.name ?? null) : null,
			roundName: match.roundName,
			slots: match.slots.map((slot) => ({
				slotIndex: slot.slotIndex,
				teamId: slot.teamId,
				teamName: slot.teamId !== null ? (teamsById.get(slot.teamId)?.name ?? null) : null,
				seed: slot.seed,
				sourceMatchKey: slot.sourceMatchKey,
				isBye: slot.isBye,
				votes: slot.votes,
				rating: slot.rating
			})),
			ready: match.slots.length > 0 && match.slots.every((s) => s.teamId !== null),
			winnerTeamId: match.winnerTeamId,
			computedWinnerTeamId: match.computedWinnerTeamId,
			overridden: match.overridden,
			overrideNote: match.overrideNote,
			tied: match.tied,
			ignoredRatings: match.ignoredRatings,
			ratingCount: match.ratingCount,
			ratings
		});
	}

	return {
		bracket: {
			id: bracket.id,
			slug: bracket.slug,
			name: bracket.name,
			description: bracket.description
		},
		teams: bracket.teams,
		voters: bracket.voters,
		divisions: bracket.divisions,
		rounds: rounds.sort((a, b) => a.order - b.order)
	};
}

export function toBracketJson(bracket: LoadedBracket): BracketJson {
	const { teamsById } = bracket;

	return {
		bracketName: bracket.name,
		description: bracket.description,
		divisions: bracket.divisions.map((division) => ({
			name: division.name,
			color: division.color,
			rounds: groupRounds(
				bracket.matches.filter((m) => m.divisionId === division.id),
				teamsById
			)
		})),
		finals: {
			rounds: groupRounds(
				bracket.matches.filter((m) => m.divisionId === null),
				teamsById
			)
		}
	};
}
