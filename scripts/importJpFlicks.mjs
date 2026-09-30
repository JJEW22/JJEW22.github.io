#!/usr/bin/env node
// scripts/importJpFlicks.mjs
//
// One-shot import of the spreadsheet seasons into jpflicks_*.
//
//   docker compose exec svelte-app node scripts/importJpFlicks.mjs --dry-run
//   docker compose exec svelte-app node scripts/importJpFlicks.mjs
//
// Idempotent: a season is deleted and rebuilt, so re-running cannot double up.
//
// The sheets hold every result twice — once in each triangle of the matrix, as
// a value and its negation — and nothing ever checked that the two agreed. This
// script checks, and REFUSES to import a season with a mismatch rather than
// silently picking a side. That is the whole reason for moving off the format.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import postgres from 'postgres';

const DRY_RUN = process.argv.includes('--dry-run');

const UNPLAYED = 'UNPLAYED';
const WONT_PLAY = 'XXX';
const FORFEIT_WIN = 'F';
const FORFEIT_LOSS = '-F';

const SEASONS = [
	{
		file: 'static/jpFlicksSeason1.xlsx',
		slug: 'season-1',
		label: 'Season 1',
		number: 1,
		// Season 1 predates the tournament-points file.
		tournamentPoints: {}
	},
	{
		file: 'static/jpFlicksSeason2.xlsx',
		slug: 'season-2',
		label: 'Season 2',
		number: 2,
		tournamentPoints: JSON.parse(fs.readFileSync('static/jpFlicks/tournamentPoints.json', 'utf8'))
	}
];

const log = (...a) => console.log(...a);

function readSheet(wb, name) {
	const ws = wb.Sheets[name];
	if (!ws) throw new Error(`missing sheet "${name}"`);
	return XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: false });
}

// The team columns, in spreadsheet order. Anything without a real header (the
// __EMPTY padding columns season 2 picked up) is not a team.
function teamOrder(rows) {
	return Object.keys(rows[0]).filter((k) => k !== 'teamName' && !k.startsWith('__EMPTY'));
}

// One matrix cell -> a result, from the ROW team's point of view.
function readCell(raw) {
	if (raw === WONT_PLAY) return { kind: 'disallowed' };
	if (raw === UNPLAYED || raw === '' || raw === null) return { kind: 'unplayed' };
	if (raw === FORFEIT_WIN) return { kind: 'forfeit', rowWon: true };
	if (raw === FORFEIT_LOSS) return { kind: 'forfeit', rowWon: false };
	// A margin. Note 0 is a tie and is a perfectly good value, so this cannot
	// test for truthiness anywhere.
	const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
	if (!Number.isFinite(n)) return { kind: 'bad', raw };
	return { kind: 'margin', margin: n };
}

// Does cell[B][A] say the same thing as cell[A][B], mirrored?
function mirrors(a, b) {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'margin') return a.margin === -b.margin;
	if (a.kind === 'forfeit') return a.rowWon === !b.rowWon;
	return true; // disallowed / unplayed are symmetric
}

function describe(c) {
	if (c.kind === 'margin') return String(c.margin);
	if (c.kind === 'forfeit') return c.rowWon ? 'F' : '-F';
	if (c.kind === 'bad') return `?${JSON.stringify(c.raw)}`;
	return c.kind;
}

// Pull one venue's matrix into a list of matches over canonical pairs.
function readVenue(rows, teams, venue, problems) {
	const byTeam = new Map(rows.map((r) => [r.teamName, r]));
	for (const t of teams) {
		if (!byTeam.has(t)) problems.push(`${venue}: no row for team "${t}"`);
	}

	const matches = [];
	for (let i = 0; i < teams.length; i++) {
		for (let j = i + 1; j < teams.length; j++) {
			const A = teams[i];
			const B = teams[j];
			const ab = readCell(byTeam.get(A)?.[B]);
			const ba = readCell(byTeam.get(B)?.[A]);

			if (ab.kind === 'bad' || ba.kind === 'bad') {
				problems.push(`${venue} ${A} v ${B}: unreadable cell ${describe(ab)} / ${describe(ba)}`);
				continue;
			}
			if (!mirrors(ab, ba)) {
				problems.push(
					`${venue} ${A} v ${B}: the two triangles disagree — ` +
						`[${A}][${B}]=${describe(ab)} but [${B}][${A}]=${describe(ba)}`
				);
				continue;
			}
			matches.push({ venue, a: A, b: B, cell: ab });
		}
	}
	return matches;
}

async function main() {
	const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
	let failed = false;

	try {
		for (const season of SEASONS) {
			log(`\n=== ${season.label} (${path.basename(season.file)}) ===`);
			const wb = XLSX.read(fs.readFileSync(season.file), { type: 'buffer' });

			const home = readSheet(wb, 'HomeGames');
			const away = readSheet(wb, 'AwayGames');
			const info = readSheet(wb, 'TeamInfo');

			const teams = teamOrder(home);
			log(`teams (${teams.length}): ${teams.join(', ')}`);

			const problems = [];

			// The away sheet must describe the same teams as the home sheet.
			const awayTeams = teamOrder(away);
			for (const t of teams) {
				if (!awayTeams.includes(t)) problems.push(`AwayGames has no column for "${t}"`);
			}

			// TeamInfo must cover every team in the matrix, exactly.
			const rosters = new Map();
			for (const row of info) {
				if (!row.name) continue;
				rosters.set(row.name, [row['Player 1'], row['Player 2']]);
			}
			for (const t of teams) {
				if (!rosters.has(t)) problems.push(`TeamInfo has no row for "${t}"`);
			}
			for (const name of rosters.keys()) {
				if (!teams.includes(name)) problems.push(`TeamInfo has "${name}", not in the matrix`);
			}

			const matches = [
				...readVenue(home, teams, 'home', problems),
				...readVenue(away, teams, 'away', problems)
			];

			// Tournament points must name real teams, or they silently vanish.
			for (const name of Object.keys(season.tournamentPoints)) {
				if (!teams.includes(name)) problems.push(`tournamentPoints has "${name}", not a team`);
			}

			const tally = matches.reduce((acc, m) => {
				acc[m.cell.kind] = (acc[m.cell.kind] ?? 0) + 1;
				return acc;
			}, {});
			log(
				`fixtures: ${matches.length} ` +
					`(${Object.entries(tally)
						.map(([k, v]) => `${v} ${k}`)
						.join(', ')})`
			);

			if (problems.length) {
				failed = true;
				log(`\n  ${problems.length} PROBLEM(S) — this season will not be imported:`);
				for (const p of problems) log(`    - ${p}`);
				continue;
			}
			log('  the two triangles agree everywhere, and the rosters line up');

			if (DRY_RUN) {
				log('  --dry-run: nothing written');
				continue;
			}

			await sql.begin(async (tx) => {
				// Rebuild rather than upsert: an import is a snapshot of a finished
				// season, and rebuilding is what makes re-running safe.
				await tx`delete from jpflicks_seasons where slug = ${season.slug}`;
				const [row] = await tx`
					insert into jpflicks_seasons (slug, label, season_number, is_current)
					values (${season.slug}, ${season.label}, ${season.number}, false)
					returning id`;
				const seasonId = Number(row.id);

				const ids = new Map();
				for (const [i, name] of teams.entries()) {
					const [t] = await tx`
						insert into jpflicks_teams (season_id, name, sort_order, tournament_points)
						values (${seasonId}, ${name}, ${i}, ${season.tournamentPoints[name] ?? 0})
						returning id`;
					ids.set(name, Number(t.id));

					const [p1, p2] = rosters.get(name);
					for (const [slot, player] of [
						[1, p1],
						[2, p2]
					]) {
						if (!player) continue;
						await tx`
							insert into jpflicks_players (team_id, name, slot)
							values (${Number(t.id)}, ${String(player).trim()}, ${slot})`;
					}
				}

				for (const m of matches) {
					// Canonical order is by id, and the cell was read from the A-row's
					// point of view, so a swap has to flip the result with it.
					let aId = ids.get(m.a);
					let bId = ids.get(m.b);
					let cell = m.cell;
					if (aId > bId) {
						[aId, bId] = [bId, aId];
						if (cell.kind === 'margin') cell = { ...cell, margin: -cell.margin };
						if (cell.kind === 'forfeit') cell = { ...cell, rowWon: !cell.rowWon };
					}

					const status =
						cell.kind === 'disallowed'
							? 'disallowed'
							: cell.kind === 'unplayed'
								? 'unplayed'
								: 'final';
					const margin = cell.kind === 'margin' ? cell.margin : null;
					// rowWon means the team_a side won, so the OTHER team forfeited.
					const forfeitBy = cell.kind === 'forfeit' ? (cell.rowWon ? bId : aId) : null;

					await tx`
						insert into jpflicks_matches
							(season_id, venue, team_a, team_b, status, margin, forfeit_by, approved_at)
						values (${seasonId}, ${m.venue}, ${aId}, ${bId}, ${status}, ${margin},
						        ${forfeitBy}, ${status === 'final' ? new Date() : null})`;
				}
			});

			const [{ n }] = await sql`
				select count(*)::int n from jpflicks_matches m
				join jpflicks_seasons s on s.id = m.season_id where s.slug = ${season.slug}`;
			log(`  imported: ${teams.length} teams, ${n} fixtures`);
		}
	} finally {
		await sql.end();
	}

	if (failed) {
		console.error('\nOne or more seasons had problems and were skipped.');
		process.exit(1);
	}
	log(DRY_RUN ? '\nDry run complete.' : '\nDone.');
}

await main();
