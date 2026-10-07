// src/routes/ultra/api/admin/+server.ts
// The ultra tracker's admin: the public display mode, and every phone that has
// sent points -- name, colour, and whether it's shown. ultra:admin (or
// site:admin) only.
import { json } from '@sveltejs/kit';
import { RACE, raceWindow } from '$lib/ultra';
import { hasRole } from '$lib/server/roles';
import {
	ULTRA_ADMIN_ROLE,
	UltraError,
	getSettings,
	listDevices,
	setMode,
	updateDevice,
	type DisplayMode
} from '$lib/server/ultra';
import type { RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };

function gate(locals: App.Locals): Response | null {
	if (!locals.user) return json({ ok: false, error: 'Sign in first.' }, { status: 401 });
	if (!hasRole(locals.user, ULTRA_ADMIN_ROLE)) {
		return json({ ok: false, error: 'This page needs the ultra:admin role.' }, { status: 403 });
	}
	return null;
}

async function state() {
	const w = raceWindow();
	return {
		ok: true,
		settings: await getSettings(),
		devices: await listDevices(),
		race: {
			name: RACE.name,
			start: w?.start.toISOString() ?? null,
			end: w?.end.toISOString() ?? null
		}
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = gate(locals);
	if (denied) return denied;
	return json(await state(), { headers: NO_STORE });
};

// Body: { mode: 'off' | 'race' | 'live' }
//    or { deviceId, name?, color?, shown? }
export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = gate(locals);
	if (denied) return denied;
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return json({ ok: false, error: 'Expected JSON.' }, { status: 400 });
	try {
		if (body.mode !== undefined) {
			if (!['off', 'race', 'live'].includes(body.mode as string)) {
				return json({ ok: false, error: 'Unknown mode.' }, { status: 400 });
			}
			await setMode(body.mode as DisplayMode);
		} else if (typeof body.deviceId === 'string') {
			await updateDevice(body.deviceId, body);
		} else {
			return json({ ok: false, error: 'Nothing to do.' }, { status: 400 });
		}
	} catch (err) {
		if (err instanceof UltraError) return json({ ok: false, error: err.message }, { status: 400 });
		throw err;
	}
	return json(await state(), { headers: NO_STORE });
};
