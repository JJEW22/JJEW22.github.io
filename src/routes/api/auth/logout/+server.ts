// src/routes/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
    await deleteSession(cookies.get('session'));
    cookies.delete('session', { path: '/' });
    return json({ ok: true });
};
