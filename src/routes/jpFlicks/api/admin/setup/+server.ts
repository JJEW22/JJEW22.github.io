// src/routes/jpFlicks/api/admin/setup/+server.ts
// Season setup: this is what replaces editing jpFlicksSeason*.xlsx.
//
// One endpoint with an `action`, rather than four routes, because the admin
// page always does the same thing afterwards — reload the whole season — and
// splitting them would only multiply the boilerplate.
//
//   season    create or update a season
//   team      create or update a team and both its players
//   delete    remove a team (its fixtures cascade)
//   fixtures  generate the home/away grid for the teams that exist
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import {
	FlicksError,
	JPFLICKS_ADMIN_ROLE,
	deleteTeam,
	generateFixtures,
	loadState,
	saveSeason,
	saveTeam,
	setDisallowed
} from '$lib/server/jpFlicks';
import type { RequestHandler } from './$types';

export const prerender = false;

const SLUG_RE = /^[a-z0-9-]{3,30}$/;

function text(value: unknown, field: string, max = 60): string {
	const s = typeof value === 'string' ? value.trim() : '';
	if (!s) throw new FlicksError(`${field} is required.`);
	if (s.length > max) throw new FlicksError(`${field} is too long (${max} characters).`);
	return s;
}

export const POST: RequestHandler = async ({ url, request, locals }) => {
	requireAdmin(locals.user, url, JPFLICKS_ADMIN_ROLE, request.headers);

	const body = await request.json().catch(() => null);
	const action = body?.action;
	let slug = typeof body?.season === 'string' ? body.season.trim().toLowerCase() : '';
	let report = null;

	try {
		if (action === 'season') {
			slug = text(body?.slug, 'The slug', 30).toLowerCase();
			if (!SLUG_RE.test(slug)) {
				throw new FlicksError('A slug looks like "season-3" — lowercase, digits and dashes.');
			}
			const seasonNumber = Number(body?.seasonNumber);
			if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
				throw new FlicksError('The season number has to be a whole number.');
			}
			await saveSeason({
				slug,
				label: text(body?.label, 'The label'),
				seasonNumber,
				homeVenue: text(body?.homeVenue, 'The home venue', 40),
				awayVenue: text(body?.awayVenue, 'The away venue', 40),
				isCurrent: Boolean(body?.isCurrent),
				isPublished: Boolean(body?.isPublished)
			});
		} else if (action === 'team') {
			if (!slug) throw new FlicksError('Which season?');
			const raw = Array.isArray(body?.players) ? body.players : [];
			if (raw.length !== 2) throw new FlicksError('A team has exactly two players.');

			const players = raw.map((p: Record<string, unknown>, i: number) => {
				const id = p?.userId;
				const userId = id === undefined || id === null || id === '' ? null : Number(id);
				if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
					throw new FlicksError(`"${id}" is not an account id.`);
				}
				return { name: text(p?.name, `Player ${i + 1}`), userId };
			});

			// Both slots pointing at one account would let that person approve
			// their own team's score, which is the one thing the two-sided flow
			// exists to prevent.
			if (players[0].userId !== null && players[0].userId === players[1].userId) {
				throw new FlicksError('Both players are linked to the same account.');
			}

			const points = Number(body?.tournamentPoints ?? 0);
			if (!Number.isFinite(points) || points < 0) {
				throw new FlicksError('Tournament points must be a number, zero or more.');
			}

			await saveTeam(slug, {
				id: body?.id === undefined || body?.id === null || body?.id === '' ? null : Number(body.id),
				name: text(body?.name, 'The team name'),
				tournamentPoints: points,
				players
			});
		} else if (action === 'delete') {
			if (!slug) throw new FlicksError('Which season?');
			const id = Number(body?.id);
			if (!Number.isInteger(id) || id <= 0) throw new FlicksError('Which team?');
			await deleteTeam(slug, id);
		} else if (action === 'fixtures') {
			if (!slug) throw new FlicksError('Which season?');
			report = await generateFixtures(slug);
		} else if (action === 'disallow') {
			if (!slug) throw new FlicksError('Which season?');
			const id = Number(body?.matchId);
			if (!Number.isInteger(id) || id <= 0) throw new FlicksError('Which match?');
			await setDisallowed(locals.user!, slug, id, Boolean(body?.disallowed));
		} else {
			throw new FlicksError(`Unknown action "${action}".`);
		}
	} catch (err) {
		if (err instanceof FlicksError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}

	const state = await loadState(locals.user, slug);
	return json({ ok: true, report, ...state }, { headers: { 'cache-control': 'no-store' } });
};
