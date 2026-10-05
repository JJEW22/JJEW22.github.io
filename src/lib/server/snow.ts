// src/lib/server/snow.ts
// Reading and writing the snow seasons and predictions.
//
// The redaction in statePayload() is the whole point of this module: until a
// season locks, a date the viewer isn't entitled to never leaves the server.
// Hiding it in the page would leave it sitting in the JSON for anyone who opened
// the network tab, which on a page whose entire purpose is not knowing what
// other people guessed is no protection at all.

import { sql } from '$lib/server/db';
import { getAccountName } from '$lib/server/accountNames';
import { hasRole } from '$lib/server/roles';
import type { SessionUser } from '$lib/server/auth';
import {
	canEditOwn,
	canManageOthers,
	canSeeAll,
	seasonLocked,
	todayISO,
	type SnowPrediction,
	type SnowSeason,
	type Viewer
} from '$lib/snow';

// site:admin implies this one, via hasRole().
export const SNOW_ADMIN_ROLE = 'snow:admin';

// Dates are `date` columns, and postgres.js would hand them back as a Date at
// LOCAL midnight — a day earlier than stored, once rendered west of Greenwich.
// That is exactly the bug the old page worked around. Read them as text.
// A function, not a constant: `sql` is a lazy proxy whose first call opens the
// connection, so building this fragment at module scope would need
// DATABASE_URL at import time. The production image has no database
// environment, and SvelteKit's analyse step imports this module during the
// build -- which is exactly how that broke the Render deploy.
const seasonColumns = () => sql`
	slug,
	label,
	to_char(deadline, 'YYYY-MM-DD') as deadline,
	to_char(first_snow, 'YYYY-MM-DD') as first_snow,
	is_current
`;

interface SeasonRow {
	slug: string;
	label: string;
	deadline: string | null;
	first_snow: string | null;
	is_current: boolean;
}

interface PredictionRow {
	id: string | number;
	user_id: string | number | null;
	display_name: string;
	predicted_date: string;
}

function toSeason(r: SeasonRow): SnowSeason {
	return {
		slug: r.slug,
		label: r.label,
		deadline: r.deadline,
		firstSnow: r.first_snow,
		isCurrent: r.is_current
	};
}

// Newest first, so the current season is the leftmost tab.
export async function listSeasons(): Promise<SnowSeason[]> {
	const rows = await sql<SeasonRow[]>`
		select ${seasonColumns()} from snow_seasons order by slug desc
	`;
	return rows.map(toSeason);
}

// The named season, or the current one, or — if nothing is marked current —
// the most recent. A site with seasons in it should never answer "no season".
export async function getSeason(slug?: string): Promise<SnowSeason | null> {
	const rows = slug
		? await sql<SeasonRow[]>`select ${seasonColumns()} from snow_seasons where slug = ${slug}`
		: await sql<SeasonRow[]>`
				select ${seasonColumns()} from snow_seasons
				order by is_current desc, slug desc limit 1
			`;
	return rows[0] ? toSeason(rows[0]) : null;
}

async function seasonId(slug: string): Promise<number | null> {
	const rows = await sql<{ id: string | number }[]>`
		select id from snow_seasons where slug = ${slug}
	`;
	return rows[0] ? Number(rows[0].id) : null;
}

async function rawPredictions(slug: string): Promise<PredictionRow[]> {
	return sql<PredictionRow[]>`
		select p.id, p.user_id, p.display_name,
		       to_char(p.predicted_date, 'YYYY-MM-DD') as predicted_date
		from snow_predictions p
		join snow_seasons s on s.id = p.season_id
		where s.slug = ${slug}
		order by lower(p.display_name)
	`;
}

function viewerFor(user: SessionUser | null, rows: PredictionRow[]): Viewer {
	return {
		username: user?.username ?? null,
		isAdmin: hasRole(user, SNOW_ADMIN_ROLE),
		hasSubmitted: user ? rows.some((r) => Number(r.user_id) === user.id) : false
	};
}

export interface SnowState {
	seasons: (SnowSeason & { locked: boolean })[];
	season: (SnowSeason & { locked: boolean; revealed: boolean }) | null;
	predictions: SnowPrediction[];
	viewer: Viewer & {
		canEditOwn: boolean;
		canManageOthers: boolean;
		myPredictionId: number | null;
		// The name on the signed-in account (users.real_name), if set.
		name: string | null;
	};
	today: string;
}

// Everything the page renders, in one request, with the dates the viewer is not
// entitled to already stripped out.
export async function loadState(user: SessionUser | null, slug?: string): Promise<SnowState> {
	const today = todayISO();
	const seasons = (await listSeasons()).map((s) => ({ ...s, locked: seasonLocked(s, today) }));
	const season = await getSeason(slug);

	if (!season) {
		return {
			seasons,
			season: null,
			predictions: [],
			viewer: {
				username: user?.username ?? null,
				isAdmin: hasRole(user, SNOW_ADMIN_ROLE),
				hasSubmitted: false,
				canEditOwn: false,
				canManageOthers: false,
				myPredictionId: null,
				name: user ? await getAccountName(user.id) : null
			},
			today
		};
	}

	const rows = await rawPredictions(season.slug);
	const viewer = viewerFor(user, rows);
	const revealed = canSeeAll(season, viewer, today);

	const predictions: SnowPrediction[] = rows.map((r) => {
		const isYou = Boolean(user) && Number(r.user_id) === user?.id;
		return {
			id: Number(r.id),
			name: r.display_name,
			// Your own pick is always yours to see; everyone else's waits for the
			// reveal. `null` rather than an omitted key, so the page can tell
			// "withheld" from "no prediction".
			date: revealed || isYou ? r.predicted_date : null,
			isYou,
			// Only meaningful once revealed; before that it would leak which rows
			// belong to accounts, which is harmless but pointless to send.
			userId: revealed ? (r.user_id === null ? null : Number(r.user_id)) : null
		};
	});

	const mine = rows.find((r) => Number(r.user_id) === user?.id);

	return {
		seasons,
		season: { ...season, locked: seasonLocked(season, today), revealed },
		predictions,
		viewer: {
			...viewer,
			canEditOwn: Boolean(user) && canEditOwn(season, viewer, today),
			canManageOthers: canManageOthers(season, viewer, today),
			myPredictionId: mine ? Number(mine.id) : null,
			name: user ? await getAccountName(user.id) : null
		},
		today
	};
}

// postgres.js surfaces a unique violation as SQLSTATE 23505. The only ones
// reachable here are the per-name and per-account indexes.
export function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export class SnowError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

// --- writing ---

// A signed-in person's own prediction. Insert or update, decided by whether
// they already have one, so the page only ever needs the one call.
export async function submitOwn(
	user: SessionUser,
	slug: string,
	name: string,
	date: string
): Promise<void> {
	const season = await getSeason(slug);
	if (!season) throw new SnowError('No such season.', 404);

	const rows = await rawPredictions(slug);
	const viewer = viewerFor(user, rows);
	const today = todayISO();

	if (seasonLocked(season, today)) {
		throw new SnowError('That season is locked — predictions are final.', 409);
	}
	if (!canEditOwn(season, viewer, today)) {
		// Only reachable for an admin who has already submitted.
		throw new SnowError(
			'Your pick is locked in. Admins cannot change their own prediction once submitted, ' +
				'because submitting is what opens everyone else to you.',
			409
		);
	}

	const id = await seasonId(slug);
	const existing = rows.find((r) => Number(r.user_id) === user.id);

	try {
		if (existing) {
			await sql`
				update snow_predictions
				set display_name = ${name}, predicted_date = ${date}, updated_at = now()
				where id = ${Number(existing.id)}
			`;
		} else {
			await sql`
				insert into snow_predictions (season_id, user_id, display_name, predicted_date)
				values (${id}, ${user.id}, ${name}, ${date})
			`;
		}
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new SnowError(
				`Someone is already predicting under the name "${name}" this season. ` +
					'Pick a different display name, or ask the admin to link that entry to your account.',
				409
			);
		}
		throw err;
	}
}

export async function deleteOwn(user: SessionUser, slug: string): Promise<void> {
	const season = await getSeason(slug);
	if (!season) throw new SnowError('No such season.', 404);

	const rows = await rawPredictions(slug);
	const viewer = viewerFor(user, rows);

	if (!canEditOwn(season, viewer, todayISO())) {
		throw new SnowError('Your prediction is locked in and cannot be withdrawn.', 409);
	}
	await sql`
		delete from snow_predictions p
		using snow_seasons s
		where p.season_id = s.id and s.slug = ${slug} and p.user_id = ${user.id}
	`;
}

// An admin entering or amending somebody else's prediction. Gated on the admin
// having their own pick in first — see canManageOthers.
export async function upsertOnBehalf(
	user: SessionUser,
	slug: string,
	input: { id?: number | null; name: string; date: string; userId?: number | null }
): Promise<void> {
	const season = await getSeason(slug);
	if (!season) throw new SnowError('No such season.', 404);

	const rows = await rawPredictions(slug);
	const viewer = viewerFor(user, rows);
	const today = todayISO();

	if (seasonLocked(season, today)) {
		throw new SnowError('That season is locked — its predictions are final.', 409);
	}
	if (!viewer.isAdmin) throw new SnowError('Admin access required.', 403);
	if (!viewer.hasSubmitted) {
		throw new SnowError(
			'Submit your own prediction first. Until you do, you cannot see or enter anyone else’s.',
			409
		);
	}

	// An admin amending their own row through this endpoint would sidestep the
	// freeze, so it is refused here too rather than only in the UI.
	if (input.id) {
		const target = rows.find((r) => Number(r.id) === input.id);
		if (!target) throw new SnowError(`No prediction with id ${input.id}.`, 404);
		if (Number(target.user_id) === user.id) {
			throw new SnowError('Use your own prediction form — and it is already locked in.', 409);
		}
	}

	// An entry linked to an account shows that account's name, when it has one —
	// names are set on /account and overridden on /admin, not here.
	if (input.userId) {
		const accountName = await getAccountName(input.userId);
		if (accountName) input = { ...input, name: accountName };
	}

	try {
		if (input.id) {
			await sql`
				update snow_predictions
				set display_name = ${input.name},
				    predicted_date = ${input.date},
				    user_id = ${input.userId ?? null},
				    updated_at = now()
				where id = ${input.id}
			`;
		} else {
			await sql`
				insert into snow_predictions (season_id, user_id, display_name, predicted_date)
				values (${await seasonId(slug)}, ${input.userId ?? null}, ${input.name}, ${input.date})
			`;
		}
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new SnowError(
				`There is already a prediction for "${input.name}" — or for that account — this season.`,
				409
			);
		}
		throw err;
	}
}

export async function deleteOnBehalf(user: SessionUser, slug: string, id: number): Promise<void> {
	const season = await getSeason(slug);
	if (!season) throw new SnowError('No such season.', 404);

	const rows = await rawPredictions(slug);
	const viewer = viewerFor(user, rows);

	if (!canManageOthers(season, viewer, todayISO())) {
		throw new SnowError('You cannot change this season’s predictions.', 409);
	}
	const target = rows.find((r) => Number(r.id) === id);
	if (!target) throw new SnowError(`No prediction with id ${id}.`, 404);
	if (Number(target.user_id) === user.id) {
		throw new SnowError('An admin cannot withdraw their own prediction.', 409);
	}
	await sql`delete from snow_predictions where id = ${id}`;
}

// --- season management ---
//
// Deliberately NOT blocked once a season locks: extending a deadline, correcting
// a label and recording the snow date are the things an admin most needs after
// the fact, and they are the escape hatch for a prediction that has to change.

export async function saveSeason(input: {
	slug: string;
	label: string;
	deadline: string | null;
	firstSnow: string | null;
	isCurrent: boolean;
}): Promise<void> {
	await sql.begin(async (tx) => {
		// The partial unique index allows only one current season, so the old one
		// has to stand down inside the same transaction.
		if (input.isCurrent) {
			await tx`update snow_seasons set is_current = false where slug <> ${input.slug}`;
		}
		await tx`
			insert into snow_seasons (slug, label, deadline, first_snow, is_current)
			values (${input.slug}, ${input.label}, ${input.deadline}, ${input.firstSnow},
			        ${input.isCurrent})
			on conflict (slug) do update set
				label = excluded.label,
				deadline = excluded.deadline,
				first_snow = excluded.first_snow,
				is_current = excluded.is_current
		`;
	});
}

// Accounts an admin can attach an entry to, with each one's name for the
// "Account names" panel. No email: neither use needs it.
export async function listAccounts(): Promise<
	{ id: number; username: string; name: string | null }[]
> {
	const rows = await sql<{ id: string | number; username: string; real_name: string | null }[]>`
		select id, username, real_name from users order by lower(username)
	`;
	return rows.map((r) => ({ id: Number(r.id), username: r.username, name: r.real_name }));
}
