// src/lib/server/jpFlicks.ts
// Reading and writing the Crokinole league.
//
// sheetsPayload() is the hinge of the whole migration: it rebuilds the exact
// {json, array, headers, rows} structure that /jpFlicks/+page.svelte used to
// get out of XLSX.utils.sheet_to_json. Everything downstream of the page's
// loader — standings, forfeit maths, the weekly game generator, the hall of
// fame — is untouched by the move to the database, because it still receives
// the matrices it has always received. The difference is that they are now
// generated from one row per match instead of two mirrored cells.

import { sql } from '$lib/server/db';
import { hasRole } from '$lib/server/roles';
import type { SessionUser } from '$lib/server/auth';
import {
	JPFLICKS_ADMIN_ROLE,
	SHEET_AWAY,
	SHEET_HOME,
	SHEET_TEAM_INFO,
	WONT_PLAY,
	canApprove,
	canSubmit,
	cellFor,
	type Match,
	type Season,
	type Team,
	type Venue,
	type Viewer
} from '$lib/jpFlicks';

export { JPFLICKS_ADMIN_ROLE };

export class FlicksError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

export function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

// --- reading ---

interface SeasonRow {
	id: string | number;
	slug: string;
	label: string;
	season_number: number;
	is_current: boolean;
	is_published: boolean;
	home_venue: string;
	away_venue: string;
}

// A function, not a constant: `sql` is a lazy proxy whose first call opens the
// connection, so building this fragment at module scope would need
// DATABASE_URL at import time. The production image has no database
// environment, and SvelteKit's analyse step imports this module during the
// build -- which is exactly how that broke the Render deploy.
const seasonColumns = () => sql`
	id, slug, label, season_number, is_current, is_published, home_venue, away_venue
`;

const toSeason = (r: SeasonRow): Season => ({
	slug: r.slug,
	label: r.label,
	seasonNumber: r.season_number,
	isCurrent: r.is_current,
	isPublished: r.is_published,
	homeVenue: r.home_venue,
	awayVenue: r.away_venue
});

// The seasons to offer as tabs. Newest first, so the current one is leftmost.
//
// Unpublished seasons are omitted unless the caller is an admin: that is what
// keeps a half-built season off the public page while still letting it be
// opened directly by anyone with the link.
export async function listSeasons(includeUnpublished = false): Promise<Season[]> {
	const rows = includeUnpublished
		? await sql<SeasonRow[]>`
				select ${seasonColumns()} from jpflicks_seasons order by season_number desc`
		: await sql<SeasonRow[]>`
				select ${seasonColumns()} from jpflicks_seasons
				where is_published order by season_number desc`;
	return rows.map(toSeason);
}

// A named season is returned whether or not it is published -- a direct URL
// always works. Only the DEFAULT (no slug) respects publication, so that a
// visitor landing on /jpFlicks never arrives on a season nobody meant to show
// them yet.
async function seasonRow(slug?: string, includeUnpublished = false): Promise<SeasonRow | null> {
	if (slug) {
		const rows = await sql<SeasonRow[]>`
			select ${seasonColumns()} from jpflicks_seasons where slug = ${slug}`;
		return rows[0] ?? null;
	}
	const rows = includeUnpublished
		? await sql<SeasonRow[]>`
				select ${seasonColumns()} from jpflicks_seasons
				order by is_current desc, season_number desc limit 1`
		: await sql<SeasonRow[]>`
				select ${seasonColumns()} from jpflicks_seasons
				where is_published
				order by is_current desc, season_number desc limit 1`;
	return rows[0] ?? null;
}

async function loadTeams(seasonId: number): Promise<Team[]> {
	const rows = await sql<
		{
			id: string | number;
			name: string;
			sort_order: number;
			tournament_points: string;
			player_id: string | number | null;
			player_name: string | null;
			slot: number | null;
			user_id: string | number | null;
			username: string | null;
		}[]
	>`
		select t.id, t.name, t.sort_order, t.tournament_points,
		       p.id as player_id, p.name as player_name, p.slot, p.user_id, u.username
		from jpflicks_teams t
		left join jpflicks_players p on p.team_id = t.id
		left join users u on u.id = p.user_id
		where t.season_id = ${seasonId}
		order by t.sort_order, t.id, p.slot`;

	const byId = new Map<number, Team>();
	for (const r of rows) {
		const id = Number(r.id);
		if (!byId.has(id)) {
			byId.set(id, {
				id,
				name: r.name,
				sortOrder: r.sort_order,
				// numeric comes back as a string from postgres.js, and the page does
				// arithmetic with it.
				tournamentPoints: Number(r.tournament_points),
				players: []
			});
		}
		if (r.player_id !== null && r.slot !== null) {
			byId.get(id)!.players.push({
				id: Number(r.player_id),
				name: r.player_name ?? '',
				slot: r.slot,
				userId: r.user_id === null ? null : Number(r.user_id),
				username: r.username
			});
		}
	}
	return [...byId.values()];
}

async function loadMatches(seasonId: number): Promise<Match[]> {
	const rows = await sql<
		{
			id: string | number;
			venue: Venue;
			team_a: string | number;
			team_b: string | number;
			status: Match['status'];
			margin: number | null;
			forfeit_by: string | number | null;
			submitted_by: string | number | null;
			submitted_team: string | number | null;
			approved_by: string | number | null;
			submitter: string | null;
		}[]
	>`
		select m.id, m.venue, m.team_a, m.team_b, m.status, m.margin, m.forfeit_by,
		       m.submitted_by, m.submitted_team, m.approved_by, u.username as submitter
		from jpflicks_matches m
		left join users u on u.id = m.submitted_by
		where m.season_id = ${seasonId}`;

	const num = (v: string | number | null) => (v === null ? null : Number(v));
	return rows.map((r) => ({
		id: Number(r.id),
		venue: r.venue,
		teamA: Number(r.team_a),
		teamB: Number(r.team_b),
		status: r.status,
		margin: r.margin,
		forfeitBy: num(r.forfeit_by),
		submittedBy: num(r.submitted_by),
		submittedByName: r.submitter,
		submittedTeam: num(r.submitted_team),
		approvedBy: num(r.approved_by)
	}));
}

// The teams this user plays for in this season. Empty unless a player row was
// linked to their account, which is only done for live seasons.
async function viewerTeams(seasonId: number, userId: number | null): Promise<number[]> {
	if (!userId) return [];
	const rows = await sql<{ team_id: string | number }[]>`
		select p.team_id from jpflicks_players p
		join jpflicks_teams t on t.id = p.team_id
		where t.season_id = ${seasonId} and p.user_id = ${userId}`;
	return rows.map((r) => Number(r.team_id));
}

interface Sheet {
	json: Record<string, string | number>[];
	array: (string | number)[][];
	headers: string[];
	rows: (string | number)[][];
}

// One venue's N×N matrix, in the shape XLSX.utils.sheet_to_json produced.
function matrixSheet(teams: Team[], matches: Match[], venue: Venue): Sheet {
	const forVenue = matches.filter((m) => m.venue === venue);
	// Keyed both ways so a lookup doesn't care which side is canonical.
	const byPair = new Map<string, Match>();
	for (const m of forVenue) {
		byPair.set(`${m.teamA}:${m.teamB}`, m);
		byPair.set(`${m.teamB}:${m.teamA}`, m);
	}

	const headers = ['teamName', ...teams.map((t) => t.name)];
	const json: Record<string, string | number>[] = [];
	const rows: (string | number)[][] = [];

	for (const row of teams) {
		const record: Record<string, string | number> = { teamName: row.name };
		const cells: (string | number)[] = [row.name];
		for (const col of teams) {
			// A team never plays itself; the sheet always wrote XXX on the diagonal.
			const value =
				row.id === col.id ? WONT_PLAY : cellOrGap(byPair.get(`${row.id}:${col.id}`), row.id);
			record[col.name] = value;
			cells.push(value);
		}
		json.push(record);
		rows.push(cells);
	}

	return { json, array: [headers, ...rows], headers, rows };
}

// A pairing with no fixture row at all reads as disallowed rather than
// unplayed: the schedule is generated up front, so a missing row means the
// matchup was never on.
function cellOrGap(match: Match | undefined, perspective: number): string | number {
	return match ? cellFor(match, perspective) : WONT_PLAY;
}

function teamInfoSheet(teams: Team[]): Sheet {
	const headers = ['name', 'Player 1', 'Player 2'];
	const json = teams.map((t) => ({
		name: t.name,
		'Player 1': t.players.find((p) => p.slot === 1)?.name ?? '',
		'Player 2': t.players.find((p) => p.slot === 2)?.name ?? ''
	}));
	const rows = json.map((r) => [r.name, r['Player 1'], r['Player 2']]);
	return { json, array: [headers, ...rows], headers, rows };
}

export interface FlicksState {
	seasons: Season[];
	season: Season | null;
	sheets: Record<string, Sheet>;
	tournamentPoints: Record<string, number>;
	teams: Team[];
	matches: (Match & { canSubmit: boolean; canApprove: boolean })[];
	viewer: Viewer;
}

export async function loadState(user: SessionUser | null, slug?: string): Promise<FlicksState> {
	const isAdmin = hasRole(user, JPFLICKS_ADMIN_ROLE);
	const seasons = await listSeasons(isAdmin);
	const row = await seasonRow(slug, isAdmin);
	const viewerBase: Viewer = {
		userId: user?.id ?? null,
		username: user?.username ?? null,
		isAdmin,
		teamIds: []
	};

	if (!row) {
		return {
			seasons,
			season: null,
			sheets: {},
			tournamentPoints: {},
			teams: [],
			matches: [],
			viewer: viewerBase
		};
	}

	const seasonId = Number(row.id);
	const season = toSeason(row);
	const [teams, matches, teamIds] = await Promise.all([
		loadTeams(seasonId),
		loadMatches(seasonId),
		viewerTeams(seasonId, user?.id ?? null)
	]);
	const viewer: Viewer = { ...viewerBase, teamIds };

	const tournamentPoints: Record<string, number> = {};
	for (const t of teams) tournamentPoints[t.name] = t.tournamentPoints;

	return {
		seasons,
		season,
		sheets: {
			[SHEET_HOME]: matrixSheet(teams, matches, 'home'),
			[SHEET_AWAY]: matrixSheet(teams, matches, 'away'),
			[SHEET_TEAM_INFO]: teamInfoSheet(teams)
		},
		tournamentPoints,
		teams,
		// The two permission flags are computed here so the page renders buttons
		// from the same predicates the endpoints enforce with.
		matches: matches.map((m) => ({
			...m,
			canSubmit: canSubmit(season, viewer, m),
			canApprove: canApprove(season, viewer, m)
		})),
		viewer
	};
}

// --- writing ---

async function requireMatch(slug: string, matchId: number) {
	const rows = await sql<
		{
			id: string | number;
			season_id: string | number;
			team_a: string | number;
			team_b: string | number;
		}[]
	>`
		select m.id, m.season_id, m.team_a, m.team_b
		from jpflicks_matches m join jpflicks_seasons s on s.id = m.season_id
		where s.slug = ${slug} and m.id = ${matchId}`;
	if (!rows[0]) throw new FlicksError(`No match ${matchId} in ${slug}.`, 404);
	return rows[0];
}

// Re-reads the season and finds the match, so every write decides on the same
// state the predicates in $lib/jpFlicks see.
async function context(user: SessionUser | null, slug: string, matchId: number) {
	const state = await loadState(user, slug);
	if (!state.season) throw new FlicksError('No such season.', 404);
	const match = state.matches.find((m) => m.id === matchId);
	if (!match) throw new FlicksError(`No match ${matchId} in ${slug}.`, 404);
	return { state, match, season: state.season, viewer: state.viewer };
}

// Enter a score. A player's entry waits for the other side; an admin's is final
// at once, because there is nobody above an admin to appeal to.
export async function submitResult(
	user: SessionUser,
	slug: string,
	matchId: number,
	result: { margin: number | null; forfeitBy: number | null }
): Promise<void> {
	const { match, viewer, season } = await context(user, slug, matchId);

	if (!canSubmit(season, viewer, match)) {
		throw new FlicksError(reasonCannotSubmit(match, viewer, season), 403);
	}
	assertResultNamesTheseTeams(result, match);

	const myTeam = viewer.teamIds.find((t) => t === match.teamA || t === match.teamB) ?? null;
	// An admin's entry is confirmed on the spot; a player's needs the opponent.
	const final = viewer.isAdmin;

	await sql`
		update jpflicks_matches set
			status = ${final ? 'final' : 'pending'},
			margin = ${result.margin},
			forfeit_by = ${result.forfeitBy},
			submitted_by = ${user.id},
			submitted_team = ${myTeam},
			submitted_at = now(),
			approved_by = ${final ? user.id : null},
			approved_at = ${final ? new Date() : null}
		where id = ${matchId}`;
}

function assertResultNamesTheseTeams(result: { forfeitBy: number | null }, match: Match): void {
	if (
		result.forfeitBy !== null &&
		result.forfeitBy !== match.teamA &&
		result.forfeitBy !== match.teamB
	) {
		throw new FlicksError('That team is not in this match.');
	}
}

function reasonCannotSubmit(match: Match, viewer: Viewer, season: Season): string {
	if (match.status === 'disallowed') return "These two teams don't play each other.";
	if (match.status === 'final') return 'That result is already agreed. An admin can change it.';
	if (match.status === 'pending' && match.submittedBy !== viewer.userId) {
		return 'Someone has already entered a score for this match — approve or reject it instead.';
	}
	if (!viewer.userId) return 'Sign in to enter a result.';
	if (!season.isCurrent) return `${season.label} is finished. Only an admin can change it now.`;
	if (!viewer.teamIds.length) {
		return 'Only the players in a match can enter its result. If you played, ask an admin to link your account to your player.';
	}
	return 'You did not play in that match.';
}

export async function approveResult(
	user: SessionUser,
	slug: string,
	matchId: number
): Promise<void> {
	const { match, viewer, season } = await context(user, slug, matchId);
	if (!canApprove(season, viewer, match)) {
		throw new FlicksError(reasonCannotApprove(match, viewer), 403);
	}
	await sql`
		update jpflicks_matches
		set status = 'final', approved_by = ${user.id}, approved_at = now()
		where id = ${matchId} and status = 'pending'`;
}

// Rejecting clears the proposal rather than keeping it around as a disputed
// value: the two sides have to agree on a number, and the way to do that is for
// someone to enter a different one.
export async function rejectResult(
	user: SessionUser,
	slug: string,
	matchId: number
): Promise<void> {
	const { match, viewer, season } = await context(user, slug, matchId);
	if (!canApprove(season, viewer, match)) {
		throw new FlicksError(reasonCannotApprove(match, viewer), 403);
	}
	await sql`
		update jpflicks_matches set
			status = 'unplayed', margin = null, forfeit_by = null,
			submitted_by = null, submitted_team = null, submitted_at = null,
			approved_by = null, approved_at = null
		where id = ${matchId} and status = 'pending'`;
}

function reasonCannotApprove(match: Match, viewer: Viewer): string {
	if (match.status !== 'pending') return 'There is nothing waiting to be approved here.';
	if (match.submittedBy === viewer.userId)
		return 'You entered this score — the other team approves it.';
	if (!viewer.userId) return 'Sign in first.';
	if (viewer.teamIds.includes(match.submittedTeam ?? -1)) {
		return 'Your own team entered this score. It needs the other team, or an admin, to agree.';
	}
	return 'Only the other team, or an admin, can approve this.';
}

// An admin clearing a result back to unplayed — the way to undo a mistake on a
// match that is already agreed.
export async function clearResult(user: SessionUser, slug: string, matchId: number): Promise<void> {
	if (!hasRole(user, JPFLICKS_ADMIN_ROLE)) throw new FlicksError('Admin access required.', 403);
	await requireMatch(slug, matchId);
	await sql`
		update jpflicks_matches set
			status = 'unplayed', margin = null, forfeit_by = null,
			submitted_by = null, submitted_team = null, submitted_at = null,
			approved_by = null, approved_at = null
		where id = ${matchId} and status <> 'disallowed'`;
}

export async function setDisallowed(
	user: SessionUser,
	slug: string,
	matchId: number,
	disallowed: boolean
): Promise<void> {
	if (!hasRole(user, JPFLICKS_ADMIN_ROLE)) throw new FlicksError('Admin access required.', 403);
	await requireMatch(slug, matchId);
	await sql`
		update jpflicks_matches set
			status = ${disallowed ? 'disallowed' : 'unplayed'},
			margin = null, forfeit_by = null, submitted_by = null, submitted_team = null,
			submitted_at = null, approved_by = null, approved_at = null
		where id = ${matchId}`;
}

// --- season setup ---
//
// Everything below is admin-only and is what replaces editing the spreadsheet:
// create a season, add its teams and their two players, link those players to
// accounts, then generate the fixture grid.

export async function saveSeason(input: {
	slug: string;
	label: string;
	seasonNumber: number;
	homeVenue: string;
	awayVenue: string;
	isCurrent: boolean;
	isPublished: boolean;
}): Promise<void> {
	await sql.begin(async (tx) => {
		// Only one season can be current, enforced by a partial unique index, so
		// the incumbent has to stand down in the same transaction.
		if (input.isCurrent) {
			await tx`update jpflicks_seasons set is_current = false where slug <> ${input.slug}`;
		}
		await tx`
			insert into jpflicks_seasons
				(slug, label, season_number, home_venue, away_venue, is_current, is_published)
			values (${input.slug}, ${input.label}, ${input.seasonNumber},
			        ${input.homeVenue}, ${input.awayVenue}, ${input.isCurrent},
			        ${input.isPublished})
			on conflict (slug) do update set
				label = excluded.label,
				season_number = excluded.season_number,
				home_venue = excluded.home_venue,
				away_venue = excluded.away_venue,
				is_current = excluded.is_current,
				is_published = excluded.is_published`;
	});
}

async function seasonIdOf(slug: string): Promise<number> {
	const rows = await sql<{ id: string | number }[]>`
		select id from jpflicks_seasons where slug = ${slug}`;
	if (!rows[0]) throw new FlicksError('No such season.', 404);
	return Number(rows[0].id);
}

// Create or rename a team and set both its players, in one call — a team is
// never useful without its two players, so they are saved together.
export async function saveTeam(
	slug: string,
	input: {
		id?: number | null;
		name: string;
		tournamentPoints: number;
		players: { name: string; userId: number | null }[];
	}
): Promise<void> {
	const seasonId = await seasonIdOf(slug);
	if (input.players.length !== 2) throw new FlicksError('A team has exactly two players.');

	try {
		await sql.begin(async (tx) => {
			let teamId = input.id ?? null;
			if (teamId) {
				const [row] = await tx`
					update jpflicks_teams
					set name = ${input.name}, tournament_points = ${input.tournamentPoints}
					where id = ${teamId} and season_id = ${seasonId}
					returning id`;
				if (!row) throw new FlicksError(`No team ${teamId} in this season.`, 404);
			} else {
				const [row] = await tx`
					insert into jpflicks_teams (season_id, name, sort_order, tournament_points)
					values (${seasonId}, ${input.name},
					        coalesce((select max(sort_order) + 1 from jpflicks_teams
					                  where season_id = ${seasonId}), 0),
					        ${input.tournamentPoints})
					returning id`;
				teamId = Number(row.id);
			}

			for (const [i, p] of input.players.entries()) {
				await tx`
					insert into jpflicks_players (team_id, name, slot, user_id)
					values (${teamId}, ${p.name}, ${i + 1}, ${p.userId})
					on conflict (team_id, slot) do update set
						name = excluded.name, user_id = excluded.user_id`;
			}
		});
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new FlicksError(`This season already has a team called "${input.name}".`, 409);
		}
		throw err;
	}
}

export async function deleteTeam(slug: string, teamId: number): Promise<void> {
	const seasonId = await seasonIdOf(slug);
	// Fixtures cascade from the team, so removing a team removes its games with
	// it. Regenerate afterwards to rebuild the grid for the teams that remain.
	const rows = await sql`
		delete from jpflicks_teams where id = ${teamId} and season_id = ${seasonId} returning id`;
	if (!rows.length) throw new FlicksError(`No team ${teamId} in this season.`, 404);
}

// Two teams cannot play each other if somebody is on both of them — one person
// cannot sit on both sides of the board. The spreadsheet recorded this by hand
// as XXX; here it is worked out from the rosters, by account where the players
// are linked and by name where they are not.
function sharesAPlayer(a: Team, b: Team): boolean {
	for (const pa of a.players) {
		for (const pb of b.players) {
			if (pa.userId !== null && pa.userId === pb.userId) return true;
			const na = pa.name.trim().toLowerCase();
			const nb = pb.name.trim().toLowerCase();
			if (na && na === nb) return true;
		}
	}
	return false;
}

export interface GenerateReport {
	created: number;
	disallowed: number;
	kept: number;
}

// Build the fixture grid: every pair of teams, at both venues.
//
// Existing fixtures are left alone — a season part-way through must not lose
// its results because a team was added. Only genuinely new pairings are
// created, and only ones with no result are re-marked as disallowed.
export async function generateFixtures(slug: string): Promise<GenerateReport> {
	const seasonId = await seasonIdOf(slug);
	const teams = await loadTeams(seasonId);
	const existing = await loadMatches(seasonId);

	const seen = new Set(existing.map((m) => `${m.venue}:${m.teamA}:${m.teamB}`));
	const byKey = new Map(existing.map((m) => [`${m.venue}:${m.teamA}:${m.teamB}`, m]));

	let created = 0;
	let disallowed = 0;
	let kept = 0;

	await sql.begin(async (tx) => {
		for (let i = 0; i < teams.length; i++) {
			for (let j = i + 1; j < teams.length; j++) {
				// team_a < team_b is a table constraint, so order by id here.
				const [a, b] = teams[i].id < teams[j].id ? [teams[i], teams[j]] : [teams[j], teams[i]];
				const blocked = sharesAPlayer(a, b);

				for (const venue of ['home', 'away'] as Venue[]) {
					const key = `${venue}:${a.id}:${b.id}`;
					const current = byKey.get(key);

					if (!seen.has(key)) {
						await tx`
							insert into jpflicks_matches (season_id, venue, team_a, team_b, status)
							values (${seasonId}, ${venue}, ${a.id}, ${b.id},
							        ${blocked ? 'disallowed' : 'unplayed'})`;
						created++;
						if (blocked) disallowed++;
						continue;
					}

					// A played game is never rewritten, even if the rosters now say
					// these two shouldn't have met — it happened.
					if (current && (current.status === 'final' || current.status === 'pending')) {
						kept++;
						continue;
					}
					const want = blocked ? 'disallowed' : 'unplayed';
					if (current && current.status !== want) {
						await tx`update jpflicks_matches set status = ${want} where id = ${current.id}`;
					}
					if (blocked) disallowed++;
					kept++;
				}
			}
		}
	});

	return { created, disallowed, kept };
}

// Accounts an admin can link a player to.
export async function listAccounts(): Promise<{ id: number; username: string }[]> {
	const rows = await sql<{ id: string | number; username: string }[]>`
		select id, username from users order by lower(username)`;
	return rows.map((r) => ({ id: Number(r.id), username: r.username }));
}
