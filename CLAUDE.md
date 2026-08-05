# CLAUDE.md

Project context for Claude Code. Keep this file short — it loads in full every session.

## Security — read first

- **Never read `.env` or `.env.*`.** They hold real credentials (`DATABASE_URL`, `FOOTBALL_DATA_TOKEN`).
  Use `.env.example` for the environment variable schema instead.
- Never read or write `secrets.json`, `*.pem`, `*.key`, or anything matching `*secrets*`.
- Never print, echo, or copy a real secret value into any file, commit, or chat response —
  including into `.env.example`. Placeholders only.
- If a task genuinely needs a secret's value, stop and ask rather than reading the file.

## What this is

A personal website built with SvelteKit. The main feature is **Premier League Pickem**
(`/premierLeaguePickem`): players pick a winner for every match each week, predict the final
20-team table, and are scored on both.

## Stack

- SvelteKit 2 + **Svelte 5**, Vite 7, TypeScript
- `@sveltejs/adapter-node` (configured in `svelte.config.js`; `adapter-auto` and
  `adapter-static` are installed but unused)
- `postgres` (porsager postgres.js) for the database
- `@node-rs/argon2` for password hashing
- `xlsx` for spreadsheet import/export
- `mdsvex` is installed but **not** wired into `svelte.config.js` yet
- Playwright for e2e tests (`e2e/`, runs against a preview build on port 4173)

## Running it

Development happens in Docker, not on the host:

```sh
docker compose up
```

Serves on `localhost:5173` with the repo bind-mounted to `/app` and `CHOKIDAR_USEPOLLING=true`
for file watching. `node_modules` is a container-only volume — do not assume host and container
dependencies match.

```sh
npm run check     # svelte-check with tsconfig
npm run lint      # prettier --check && eslint
npm run format    # prettier --write
npm run test      # playwright e2e
```

## Code conventions

- **Prettier is authoritative**: tabs, single quotes, no trailing commas, 100-char lines.
  Run `npm run format` rather than hand-formatting.
- **The pickem page uses Svelte 4 syntax, not runes** — `$:` reactive statements, `on:click`,
  plain `let` for state. Do not migrate it to `$state`/`$derived`/`onclick` unless explicitly
  asked. Match the surrounding style in whatever file you're editing.
- `src/routes/premierLeaguePickem/+page.svelte` is plain JS (no `lang="ts"`).
- ESLint 9 flat config in `eslint.config.js`; `no-undef` is off (TypeScript handles it).

## Architecture notes

- **Team data**: `$lib/plTeams` exports `TEAMS` (array) and `teamById` (lookup). Each team has
  `id`, `name`, and `color`.
- **API routes**: pickem endpoints live under `/premierLeaguePickem/api`
  (`fixtures`, `me`, `picks`, `season`, `join`, `leaderboard`, `standings`,
  `admin/sync-odds`, `admin/sync-results`).
  Auth is separate, at `/api/auth/login` and `/api/auth/logout`.
- **Roles**: `site:admin` and `pickem:admin` both unlock the Admin tab.
- **External data**: standings come from football-data.org via the standings route.
- **Client-side fallbacks**: the page falls back to `SAMPLE_MATCHWEEKS` and zeroed standings when
  fetches fail, so it renders before the backend is up. Preserve this behavior.

### Constants that must stay in sync

These are duplicated between the frontend and backend. Changing one means changing the other —
the comments in the source mark them:

| Constant | Value | Lives in |
|---|---|---|
| `BASE_POINTS` | 25 | `+page.svelte` and `scoring.ts` |
| `PICK_LOCK_LEAD_MS` | 15 min | `+page.svelte` and `season.ts` |

Bonus match points (Golden +10 / Silver +5 / Bronze +3) and the fan-team bonus (+5) stack, and
are implemented in both `effectiveBase()` on the client and `scoring.ts` on the server.

## Don't

- Don't commit `.env`, `secrets.json`, or anything matching `*secrets*`.
- Don't run `npm install` on the host expecting it to affect the container.
- Don't convert existing Svelte 4 syntax to runes as a drive-by change.
- Don't edit `package-lock.json` by hand.
- Don't remove the `inject-build-date` plugin in `vite.config.ts` — it replaces the
  `__BUILD_DATE__` token in `src/routes/+page.svelte` at build time.