#!/usr/bin/env node
// scripts/importPizzaBracket.mjs
//
// One-shot: move the pizza bracket out of static/pizzaBracket/ and into the tables
// created by sql/015_pizza_bracket.sql. Structure comes from pizzaBracket.json,
// per-voter ratings from pizzaBracketRatings.xlsx.
//
// Nothing reads those two files afterwards. They stay in the repo as the historical
// record, alongside processPizzaRatings.py which produced them.
//
// Run inside the container, where node_modules lives:
//   docker compose exec svelte-app node scripts/importPizzaBracket.mjs --replace
//
// --dry-run parses both files and prints what it WOULD write, touching no database.
// It needs no DATABASE_URL, so it is the cheap way to check the column derivation.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATIC_DIR = path.join(ROOT, 'static', 'pizzaBracket');

const SLUG = 'jp-2025';

// Mirrors processPizzaRatings.py, which these numbers came from.
const FIRST_VOTER_ROW = 3; // 1-indexed; rows 1-2 are subheader and team name
const FIRST_TEAM_COL = 2; // 1-indexed; column A is the voter
// The workbook was one sheet called "Pizza Ratings" holding round 1 only.
const SHEET_ALIASES = { 'Round 1': ['Pizza Ratings'] };

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const REPLACE = args.has('--replace');

// A slot with nobody in it yet. Note that a REAL pizzeria here is named "Round 2",
// so a round-shaped name is not a placeholder.
export function isPlaceholder(name) {
	return !name || String(name).trim() === '' || String(name).trim() === 'TBD';
}

// ---------- structure ----------

// Ordered: round name -> [{ divisionName, subheader, match, sortOrder }].
// Rounds of the same name share a sheet, all four divisions side by side, which is
// how the workbook is laid out.
export function roundLayout(bracket) {
	const rounds = new Map();
	const push = (name, entry) => {
		if (!rounds.has(name)) rounds.set(name, []);
		rounds.get(name).push(entry);
	};

	bracket.divisions.forEach((division) => {
		division.rounds.forEach((round) => {
			round.matches.forEach((match, sortOrder) => {
				push(round.name, {
					divisionName: division.name,
					subheader: division.name + ' - ' + round.name,
					match,
					sortOrder
				});
			});
		});
	});

	(bracket.finals?.rounds ?? []).forEach((round) => {
		round.matches.forEach((match, sortOrder) => {
			push(round.name, {
				divisionName: null,
				// Two semifinals on one sheet would otherwise both read "Semifinals".
				subheader:
					round.matches.length > 1 ? round.name + ' - Match ' + (sortOrder + 1) : round.name,
				match,
				sortOrder
			});
		});
	});

	return rounds;
}

// Derive sheet/column -> match/team. Columns are reserved for every slot including
// TBD ones, so a column never moves; only fully-known matchups are readable, since
// an unresolved one has nothing to rate.
export function buildColumnMap(bracket) {
	const columns = [];
	const pending = [];

	for (const [sheet, entries] of roundLayout(bracket)) {
		let col = FIRST_TEAM_COL;
		for (const { subheader, match } of entries) {
			const names = match.teams.map((t) => t.name);
			if (names.length && !names.some(isPlaceholder)) {
				match.teams.forEach((team, teamIndex) => {
					columns.push({
						sheet,
						column: col + teamIndex,
						matchKey: match.id,
						teamIndex,
						teamName: team.name,
						seed: team.seed ?? null,
						subheader
					});
				});
			} else {
				pending.push({ sheet, matchKey: match.id });
			}
			col += names.length; // reserved either way
		}
	}

	return { columns, pending };
}

// The pizzerias that ENTER the bracket somewhere. Every later-round occupant is one
// of these, arriving by winning, so slots that name a source contribute no new team.
export function collectTeams(bracket) {
	const names = [];
	for (const [, entries] of roundLayout(bracket)) {
		for (const { match } of entries) {
			for (const team of match.teams) {
				const entersHere = !team.source || team.source === 'bye';
				if (entersHere && !isPlaceholder(team.name) && !names.includes(team.name)) {
					names.push(team.name);
				}
			}
		}
	}
	return names;
}

// ---------- ratings ----------

function readSheet(workbook, name) {
	if (workbook.Sheets[name]) return workbook.Sheets[name];
	for (const alias of SHEET_ALIASES[name] ?? []) {
		if (workbook.Sheets[alias]) {
			console.log('  (reading ' + alias + ' as ' + name + ')');
			return workbook.Sheets[alias];
		}
	}
	return null;
}

function cellValue(sheet, row1, col1) {
	const cell = sheet[XLSX.utils.encode_cell({ r: row1 - 1, c: col1 - 1 })];
	return cell ? cell.v : undefined;
}

// Returns { ratings: [{ matchKey, teamName, voter, rating }], voters: [name] }.
// Keyed by voter rather than row order: the old code zipped two teams' rating lists
// by index, so one voter skipping one team shifted everyone after them onto the
// wrong opponent.
export function readWorkbook(xlsxPath, columns) {
	const ratings = [];
	const voters = [];

	if (!fs.existsSync(xlsxPath)) {
		console.log('  no workbook at ' + xlsxPath);
		return { ratings, voters };
	}

	const workbook = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });

	const bySheet = new Map();
	for (const entry of columns) {
		if (!bySheet.has(entry.sheet)) bySheet.set(entry.sheet, []);
		bySheet.get(entry.sheet).push(entry);
	}

	for (const [sheetName, entries] of bySheet) {
		const sheet = readSheet(workbook, sheetName);
		if (!sheet) continue;

		const range = XLSX.utils.decode_range(sheet['!ref']);
		let found = 0;

		for (let row = FIRST_VOTER_ROW; row <= range.e.r + 1; row++) {
			const rawVoter = cellValue(sheet, row, 1);
			if (rawVoter === undefined || String(rawVoter).trim() === '') continue;
			const voter = String(rawVoter).trim();
			if (!voters.includes(voter)) voters.push(voter);

			for (const entry of entries) {
				const raw = cellValue(sheet, row, entry.column);
				if (raw === undefined || raw === '') continue;
				const rating = Number(raw);
				if (!Number.isFinite(rating)) continue;
				ratings.push({ matchKey: entry.matchKey, teamName: entry.teamName, voter, rating });
				found++;
			}
		}

		console.log('  ' + sheetName + ': ' + found + ' ratings');
	}

	return { ratings, voters };
}

// ---------- write ----------

async function write(bracket, teamNames, layout, voters, ratings) {
	const { default: postgres } = await import('postgres');
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

	try {
		const [existing] = await sql`select id from pizza_brackets where slug = ${SLUG}`;
		if (existing && !REPLACE) {
			throw new Error(
				'bracket ' +
					SLUG +
					' already exists (id ' +
					existing.id +
					'). Re-run with --replace to delete it and everything hanging off it.'
			);
		}

		await sql.begin(async (tx) => {
			if (existing) {
				await tx`delete from pizza_brackets where id = ${existing.id}`;
				console.log('\nReplaced existing bracket id ' + existing.id);
			}

			const [row] = await tx`
				insert into pizza_brackets (slug, name, description, is_active)
				values (${SLUG}, ${bracket.bracketName}, ${bracket.description ?? null}, true)
				returning id
			`;
			const bracketId = row.id;

			// Only one bracket renders at /pizzaBracket.
			await tx`update pizza_brackets set is_active = false where id <> ${bracketId}`;

			const teamId = new Map();
			for (const name of teamNames) {
				const [t] = await tx`
					insert into pizza_teams (bracket_id, name)
					values (${bracketId}, ${name})
					returning id
				`;
				teamId.set(name, t.id);
			}

			const divisionId = new Map();
			for (const [i, division] of bracket.divisions.entries()) {
				const [d] = await tx`
					insert into pizza_divisions (bracket_id, name, color, sort_order)
					values (${bracketId}, ${division.name}, ${division.color ?? null}, ${i})
					returning id
				`;
				divisionId.set(division.name, d.id);
			}

			// Every match is inserted before any slot, because a slot's source_match_id
			// can point at a match in the same round or a later one.
			const matchId = new Map();
			let roundOrder = 0;
			for (const [roundName, entries] of layout) {
				for (const entry of entries) {
					const [m] = await tx`
						insert into pizza_matches
							(bracket_id, division_id, round_name, round_order, match_key, kind, sort_order)
						values (
							${bracketId},
							${entry.divisionName ? divisionId.get(entry.divisionName) : null},
							${roundName},
							${roundOrder},
							${entry.match.id},
							${entry.match.type ?? 'standard'},
							${entry.sortOrder}
						)
						returning id
					`;
					matchId.set(entry.match.id, m.id);
				}
				roundOrder++;
			}

			let slotCount = 0;
			for (const [, entries] of layout) {
				for (const { match } of entries) {
					for (const [slotIndex, team] of match.teams.entries()) {
						const isBye = team.source === 'bye';
						// A slot fed by an earlier match holds no team of its own; the
						// winner of that match occupies it at read time.
						const derived = Boolean(team.source) && !isBye;
						await tx`
							insert into pizza_slots
								(match_id, slot_index, team_id, seed, source_match_id, is_bye)
							values (
								${matchId.get(match.id)},
								${slotIndex},
								${derived ? null : (teamId.get(team.name) ?? null)},
								${team.seed ?? null},
								${derived ? (matchId.get(team.source) ?? null) : null},
								${isBye}
							)
						`;
						slotCount++;
					}
				}
			}

			const voterId = new Map();
			for (const [i, name] of voters.entries()) {
				const [v] = await tx`
					insert into pizza_voters (bracket_id, name, sort_order)
					values (${bracketId}, ${name}, ${i})
					returning id
				`;
				voterId.set(name, v.id);
			}

			for (const r of ratings) {
				await tx`
					insert into pizza_ratings (match_id, team_id, voter_id, rating)
					values (
						${matchId.get(r.matchKey)},
						${teamId.get(r.teamName)},
						${voterId.get(r.voter)},
						${r.rating}
					)
					on conflict (match_id, team_id, voter_id) do update
						set rating = excluded.rating, updated_at = now()
				`;
			}

			console.log(
				'\nWrote bracket ' +
					bracketId +
					': ' +
					teamId.size +
					' teams, ' +
					divisionId.size +
					' divisions, ' +
					matchId.size +
					' matches, ' +
					slotCount +
					' slots, ' +
					voterId.size +
					' voters, ' +
					ratings.length +
					' ratings'
			);
		});
	} finally {
		await sql.end();
	}
}

// ---------- main ----------

async function main() {
	const bracketPath = path.join(STATIC_DIR, 'pizzaBracket.json');
	const xlsxPath = path.join(STATIC_DIR, 'pizzaBracketRatings.xlsx');

	const bracket = JSON.parse(fs.readFileSync(bracketPath, 'utf8'));
	const layout = roundLayout(bracket);
	const { columns, pending } = buildColumnMap(bracket);
	const teamNames = collectTeams(bracket);

	console.log('Bracket: ' + bracket.bracketName);
	console.log('  ' + teamNames.length + ' teams, ' + bracket.divisions.length + ' divisions');
	console.log('  rounds: ' + [...layout.keys()].join(', '));
	console.log(
		'  ' +
			columns.length +
			' readable team columns across ' +
			new Set(columns.map((c) => c.sheet)).size +
			' sheet(s)'
	);
	if (pending.length) {
		console.log(
			'  awaiting earlier results (' +
				pending.length +
				'): ' +
				pending.map((p) => p.matchKey + ' [' + p.sheet + ']').join(', ')
		);
	}

	console.log('\nReading workbook:');
	const { ratings, voters } = readWorkbook(xlsxPath, columns);
	const ratedMatches = new Set(ratings.map((r) => r.matchKey));
	console.log(
		'\n' +
			voters.length +
			' voters, ' +
			ratings.length +
			' ratings, ' +
			ratedMatches.size +
			' matches rated'
	);

	// An unknown name here would mean a rating with nowhere to go, which is exactly
	// the failure the old name-keyed pipeline hid.
	const orphans = ratings.filter((r) => !teamNames.includes(r.teamName));
	if (orphans.length) {
		const names = [...new Set(orphans.map((o) => o.teamName))];
		throw new Error(
			orphans.length + ' rating(s) name a team not in the bracket: ' + names.join(', ')
		);
	}

	if (DRY_RUN) {
		console.log('\n--dry-run: nothing written.');
		for (const [roundName, entries] of layout) {
			const rated = entries.filter((e) => ratedMatches.has(e.match.id)).length;
			console.log(
				'  ' + roundName + ': ' + entries.length + ' matches, ' + rated + ' with ratings'
			);
		}
		return;
	}

	await write(bracket, teamNames, layout, voters, ratings);
}

// Only when run directly — the parsing helpers above are imported by
// scripts/verifyPizzaScoring.mjs, which must not trigger a write.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error('\nImport failed: ' + err.message);
		process.exit(1);
	});
}
