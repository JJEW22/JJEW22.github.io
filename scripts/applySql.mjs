#!/usr/bin/env node
// scripts/applySql.mjs
//
// Apply one of the sql/*.sql files. The container image has no psql, and every
// migration in this repo is written to be safe to re-run, so this just sends the
// file straight through postgres.js.
//
//   docker compose exec svelte-app node scripts/applySql.mjs sql/015_pizza_bracket.sql
//
// Prints the statements it is about to run with --dry-run.

import * as fs from 'node:fs';
import * as path from 'node:path';
import postgres from 'postgres';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
	console.error('Usage: node scripts/applySql.mjs <path-to.sql> [--dry-run]');
	process.exit(1);
}

const full = path.resolve(file);
if (!fs.existsSync(full)) {
	console.error('No such file: ' + full);
	process.exit(1);
}

const text = fs.readFileSync(full, 'utf8');

if (DRY_RUN) {
	console.log(text);
	console.log('\n--dry-run: nothing applied.');
	process.exit(0);
}

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

try {
	// .simple() lets one round trip carry the whole file; the extended protocol
	// postgres.js uses by default allows only one statement at a time.
	await sql.unsafe(text).simple();
	console.log('Applied ' + path.basename(full));
} catch (err) {
	console.error('Failed to apply ' + path.basename(full) + ': ' + err.message);
	process.exitCode = 1;
} finally {
	await sql.end();
}
