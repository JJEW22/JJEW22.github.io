// src/lib/pizzaScoring.ts
// Single source of truth for how a pizza matchup is decided. Client-safe (not under
// $lib/server) so the admin grid can show the winner it is about to save, and the
// public bracket can explain one, without either re-deriving the rules.
//
// Ported from the scoring half of static/pizzaBracket/processPizzaRatings.py, which
// this replaces. The rules are unchanged; only the input moved.

// A pizzeria in a matchup, with every rating it received for THAT matchup.
// Keyed by voter: a voter who rated one team and skipped the other must not be
// lined up against whoever happens to sit next to them. The old pipeline zipped
// two teams' rating lists by index, so one skipped cell shifted every voter after
// it onto the wrong opponent.
export interface Entrant {
	teamId: number;
	ratings: Record<number, number>; // voterId -> 1-5
}

export interface TeamResult {
	teamId: number;
	// Head-to-head votes. Null for a team that never reached the vote — the one
	// eliminated on average in a 3-way, or a slot nobody rated. 0 would read as
	// "lost every one".
	votes: number | null;
	rating: number; // mean of every rating this team got, rounded to 2dp
	eliminated: boolean;
}

export interface MatchResult {
	winnerTeamId: number | null;
	results: TeamResult[];
	// Voters who rated exactly one side of the deciding pair. Their ratings still
	// count toward averages but say nothing about a preference, so they are dropped
	// from the vote — worth surfacing rather than silently discarding.
	ignoredRatings: number;
	// The deciding pair finished level on both votes and average. Resolved by slot
	// order, which is arbitrary — the admin page flags this so it can be overridden.
	tied: boolean;
}

export function average(ratings: Record<number, number>): number {
	const values = Object.values(ratings);
	if (!values.length) return 0;
	return values.reduce((sum, r) => sum + r, 0) / values.length;
}

// Half-up, which is what everyone expects. Python's round() is half-to-EVEN, so
// four averages in the 2025 bracket come out 0.01 lower there than here (JPHOP
// 3.12 vs 3.13, and so on). Both are defensible; nothing downstream can tell,
// because the bracket renders one decimal place and the stored input is the raw
// per-voter ratings rather than these averages.
export function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function rated(entrant: Entrant): boolean {
	return Object.keys(entrant.ratings).length > 0;
}

// Head-to-head. Votes count only voters who rated BOTH teams; averages use every
// rating each team got. Ties break on the higher average, then on slot order.
function headToHead(a: Entrant, b: Entrant) {
	const shared = Object.keys(a.ratings)
		.map(Number)
		.filter((voterId) => voterId in b.ratings);

	let votesA = 0;
	let votesB = 0;
	for (const voterId of shared) {
		if (a.ratings[voterId] > b.ratings[voterId]) votesA++;
		else if (b.ratings[voterId] > a.ratings[voterId]) votesB++;
	}

	const avgA = average(a.ratings);
	const avgB = average(b.ratings);

	let winnerTeamId: number;
	let tied = false;
	if (votesA !== votesB) winnerTeamId = votesA > votesB ? a.teamId : b.teamId;
	else if (avgA !== avgB) winnerTeamId = avgA > avgB ? a.teamId : b.teamId;
	else {
		winnerTeamId = a.teamId;
		tied = true;
	}

	const ignoredRatings =
		Object.keys(a.ratings).length - shared.length + (Object.keys(b.ratings).length - shared.length);

	return { winnerTeamId, votesA, votesB, avgA, avgB, ignoredRatings, tied };
}

// Shape a decided pair back into a result covering EVERY entrant, so a team that
// was eliminated or never rated still reports its average rather than vanishing.
function pairResult(
	entrants: Entrant[],
	a: Entrant,
	b: Entrant,
	h: ReturnType<typeof headToHead>,
	eliminatedTeamId: number | null
): MatchResult {
	const votes: Record<number, number> = { [a.teamId]: h.votesA, [b.teamId]: h.votesB };
	const averages: Record<number, number> = { [a.teamId]: h.avgA, [b.teamId]: h.avgB };

	return {
		winnerTeamId: h.winnerTeamId,
		results: entrants.map((e) => ({
			teamId: e.teamId,
			votes: e.teamId in votes ? votes[e.teamId] : null,
			rating: round2(e.teamId in averages ? averages[e.teamId] : average(e.ratings)),
			eliminated: e.teamId === eliminatedTeamId
		})),
		ignoredRatings: h.ignoredRatings,
		tied: h.tied
	};
}

function undecided(entrants: Entrant[], winnerTeamId: number | null = null): MatchResult {
	return {
		winnerTeamId,
		results: entrants.map((e) => ({
			teamId: e.teamId,
			// A walkover winner reached no vote either, but 0 is the honest count
			// there: it won by being the only one on the table.
			votes: e.teamId === winnerTeamId ? 0 : null,
			rating: round2(average(e.ratings)),
			eliminated: false
		})),
		ignoredRatings: 0,
		tied: false
	};
}

// Two in a matchup. Both slots take part whether or not anyone rated them — an
// unrated team averages 0 and loses, rather than holding the match open.
function scoreStandard(entrants: Entrant[]): MatchResult {
	if (entrants.length < 2) return undecided(entrants);
	const [a, b] = entrants;
	if (!rated(a) && !rated(b)) return undecided(entrants);
	return pairResult(entrants, a, b, headToHead(a, b), null);
}

// Three in a matchup: the lowest average is eliminated outright, then the other two
// go head-to-head. A three-way vote count has no natural meaning here — people rate
// pizzas, they don't rank them — so the average is what thins the field.
//
// Unlike a 2-team match, this one counts only RATED teams: with three slots, an
// unrated one would otherwise always be the lowest average and be eliminated on no
// evidence, silently turning the match into a head-to-head nobody agreed to.
function scoreTriple(entrants: Entrant[]): MatchResult {
	const live = entrants.filter(rated);
	if (live.length === 0) return undecided(entrants);
	if (live.length === 1) return undecided(entrants, live[0].teamId);
	if (live.length === 2)
		return pairResult(entrants, live[0], live[1], headToHead(live[0], live[1]), null);

	// Ties on the lowest average keep the earlier slot, matching the stable sort
	// the Python used.
	const lowest = live.reduce((min, e) => (average(e.ratings) < average(min.ratings) ? e : min));
	const [a, b] = live.filter((e) => e.teamId !== lowest.teamId);
	return pairResult(entrants, a, b, headToHead(a, b), lowest.teamId);
}

// The whole decision for one matchup. `entrants` must be in slot order — that order
// is the tiebreak of last resort, so it has to be stable.
export function scoreMatch(kind: 'standard' | 'triple', entrants: Entrant[]): MatchResult {
	if (!entrants.length) return undecided(entrants);
	return kind === 'triple' ? scoreTriple(entrants) : scoreStandard(entrants);
}
