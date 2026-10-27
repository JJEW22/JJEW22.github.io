// src/routes/housing/api/houses/+server.ts
// The houses every housing admin is considering. Shared: any admin can add,
// edit or remove any of them, and every write answers with the full list.
//
//   GET                          the list
//   POST   { url, ...fields }    add one by its Zillow link
//   PATCH  { id, ...fields }     edit details, notes, or saved assumptions
//   DELETE { id }                remove one
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/roles';
import {
	HOUSING_ADMIN_ROLE,
	HouseError,
	addHouse,
	deleteHouse,
	listHouses,
	readFields,
	updateHouse
} from '$lib/server/housing';
import type { RequestHandler } from './$types';

export const prerender = false;

const noStore = { 'cache-control': 'no-store' };

async function respond(work: () => Promise<void>) {
	try {
		await work();
	} catch (err) {
		if (err instanceof HouseError) {
			return json({ ok: false, error: err.message }, { status: err.status });
		}
		throw err;
	}
	return json({ ok: true, houses: await listHouses() }, { headers: noStore });
}

function idOf(body: Record<string, unknown> | null): number {
	const id = Number(body?.id);
	if (!Number.isInteger(id) || id <= 0) throw new HouseError('A house id is required.');
	return id;
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	return respond(async () => {});
};

export const POST: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	return respond(() =>
		addHouse(
			locals.user?.id ?? null,
			typeof body?.url === 'string' ? body.url : '',
			readFields(body)
		)
	);
};

export const PATCH: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	return respond(async () => updateHouse(idOf(body), readFields(body)));
};

export const DELETE: RequestHandler = async ({ url, locals, request }) => {
	requireAdmin(locals.user, url, HOUSING_ADMIN_ROLE, request.headers);
	const body = await request.json().catch(() => null);
	return respond(async () => deleteHouse(idOf(body)));
};
