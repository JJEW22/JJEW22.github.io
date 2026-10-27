// src/routes/housing/api/houses/respond.ts
// Shared by ./+server.ts and ./lookup/+server.ts: every houses endpoint answers
// with the same shape, so the page has one way to apply any of them.
import { json } from '@sveltejs/kit';
import { HouseError, listHouses, rentcastUsage } from '$lib/server/housing';

const noStore = { 'cache-control': 'no-store' };

// Run `work`, then answer with the list. `work` may return a message for the
// page, e.g. what a RentCast lookup filled in. `me` is the signed-in admin's id,
// so the page can tell their own rating from everyone else's.
export async function respond(work: () => Promise<string | void>, me: number | null) {
	let message: string | void;
	try {
		message = await work();
	} catch (err) {
		if (err instanceof HouseError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
	return json(
		{
			ok: true,
			message: message ?? null,
			me,
			houses: await listHouses(),
			rentcast: await rentcastUsage()
		},
		{ headers: noStore }
	);
}

export function idOf(body: Record<string, unknown> | null): number {
	const id = Number(body?.id);
	if (!Number.isInteger(id) || id <= 0) throw new HouseError('A house id is required.');
	return id;
}
