// src/routes/housing/api/houses/+server.ts
// The houses every housing admin is considering. Shared: any admin can add,
// edit or remove any of them, and every write answers with the full list and
// how much of the month's RentCast allowance is left.
//
//   GET                          the list
//   POST   { url, ...fields }    add one by its Zillow link, then look it up
//                                on RentCast (when RENTCAST_API_KEY is set)
//   PATCH  { id, ...fields }     edit details, notes, or saved assumptions
//   PATCH  { id, eliminated }    eliminate (true) or restore (false) a house
//   PATCH  { id, soldPrice }     mark it sold to someone else, for that much;
//                                null puts it back on the list
//   DELETE { id }                remove one
//
// Looking an existing house up again is ./lookup; rating one is ./rating.
import { requireAdmin } from '$lib/server/roles';
import {
	HOUSING_ADMIN_ROLE,
	addHouse,
	deleteHouse,
	readFields,
	refreshFromRentcast,
	setEliminated,
	setSold,
	rentcastConfigured,
	rentcastPausedMessage,
	rentcastUsage,
	updateHouse
} from '$lib/server/housing';
import { idOf, respond } from './respond';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	return respond(async () => {}, locals.user?.id ?? null);
};

export const POST: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	return respond(async () => {
		const id = await addHouse(
			locals.user?.id ?? null,
			typeof body?.url === 'string' ? body.url : '',
			readFields(body)
		);
		if (!rentcastConfigured()) return 'Added. Set RENTCAST_API_KEY to fill in the details.';
		const usage = await rentcastUsage();
		if (usage.paused) return `Added. ${rentcastPausedMessage(usage.used)}`;
		// The house is in either way; a lookup that fails only costs the details.
		try {
			return `Added. ${await refreshFromRentcast(id, false)}`;
		} catch (err) {
			return `Added, but the RentCast lookup failed: ${err instanceof Error ? err.message : err}`;
		}
	}, locals.user?.id ?? null);
};

export const PATCH: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	const me = locals.user?.id ?? null;
	return respond(async () => {
		if (typeof body?.eliminated === 'boolean') {
			await setEliminated(idOf(body), me, body.eliminated);
			return body.eliminated ? 'Eliminated. It is off the list and won’t be synced.' : 'Restored.';
		}
		if (body && 'soldPrice' in body) {
			const price = body.soldPrice === null ? null : Number(body.soldPrice);
			await setSold(idOf(body), me, price);
			return price === null ? 'Restored.' : 'Marked sold. It is off the list and won’t be synced.';
		}
		await updateHouse(idOf(body), readFields(body));
	}, me);
};

export const DELETE: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	return respond(async () => deleteHouse(idOf(body)), locals.user?.id ?? null);
};
