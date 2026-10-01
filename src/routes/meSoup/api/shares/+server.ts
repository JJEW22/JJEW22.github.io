// src/routes/meSoup/api/shares/+server.ts
// Who you've shared your whole map with. Adding someone gives them a
// <YourName>Soup view of every spot you have; removing them takes it away.
// Everything here is scoped to the signed-in user as the owner.
import { error, json } from '@sveltejs/kit';
import { addMapShare, listMapShares, removeMapShare } from '$lib/server/swimSpots';
import type { SessionUser } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const prerender = false;

function requireUser(user: SessionUser | null): number {
	if (!user) throw error(401, 'Sign in to share your map.');
	return user.id;
}

async function payload(ownerId: number) {
	return json(
		{ ok: true, shares: await listMapShares(ownerId) },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}

async function username(request: Request): Promise<string | null> {
	const body = await request.json().catch(() => null);
	const name = typeof body?.username === 'string' ? body.username.trim().replace(/^@/, '') : '';
	return name || null;
}

export const GET: RequestHandler = async ({ locals }) => payload(requireUser(locals.user));

export const POST: RequestHandler = async ({ request, locals }) => {
	const ownerId = requireUser(locals.user);
	const name = await username(request);
	if (!name) return json({ ok: false, error: 'Who should see your map?' }, { status: 400 });
	const added = await addMapShare(ownerId, name);
	if (!added.ok) return json({ ok: false, error: added.error }, { status: 400 });
	return payload(ownerId);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const ownerId = requireUser(locals.user);
	const name = await username(request);
	if (!name) return json({ ok: false, error: 'Whose access should go?' }, { status: 400 });
	await removeMapShare(ownerId, name);
	return payload(ownerId);
};
