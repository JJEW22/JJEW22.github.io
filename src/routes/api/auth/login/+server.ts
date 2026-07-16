// src/routes/api/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sql } from '$lib/server/db';
import { verifyPassword, createSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// Site-wide login. Accepts an email OR a username as the identifier.
export const POST: RequestHandler = async ({ request, cookies }) => {
    const { identifier, password } = await request.json();
    const id = (identifier ?? '').trim().toLowerCase();
    if (!id || (password ?? '').length < 4) {
        return json({ ok: false, error: 'Enter your email or username and password.' }, { status: 400 });
    }
    const existing = (await sql`
        select id, password_hash from users where username = ${id} or email = ${id}`)[0];
    if (!existing) {
        return json({ ok: false, error: 'No account found. Accounts are invite-only.' }, { status: 401 });
    }
    const ok = await verifyPassword(existing.password_hash, password);
    if (!ok) return json({ ok: false, error: 'Wrong password.' }, { status: 401 });

    const { token, expiresAt } = await createSession(Number(existing.id));
    cookies.set('session', token, { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax', expires: expiresAt });
    return json({ ok: true });
};
