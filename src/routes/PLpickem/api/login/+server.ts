import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sql } from '$lib/server/db';
import { hashPassword, verifyPassword, createSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// First login for a username creates the account; after that it verifies.
// (Split into separate /register and /login if you want a stricter flow.)
export const POST: RequestHandler = async ({ request, cookies }) => {
    const { username, code } = await request.json();
    const uname = (username ?? '').trim().toLowerCase();
    if (uname.length < 2 || (code ?? '').length < 4) {
        return json({ ok: false, error: 'Username needs 2+ chars, code needs 4+.' }, { status: 400 });
    }

    const existing = (await sql`select id, password_hash from users where username = ${uname}`)[0];
    let userId: number;
    if (existing) {
        const ok = await verifyPassword(existing.password_hash, code);
        if (!ok) return json({ ok: false, error: 'Wrong access code.' }, { status: 401 });
        userId = Number(existing.id);
    } else {
        const passwordHash = await hashPassword(code);
        userId = Number(
            (await sql`insert into users (username, password_hash)
                       values (${uname}, ${passwordHash}) returning id`)[0].id
        );
    }

    const { token, expiresAt } = await createSession(userId);
    cookies.set('session', token, {
        path: '/',
        httpOnly: true, // JS can't read it -> XSS can't steal it
        secure: !dev, // HTTPS only in production
        sameSite: 'lax', // not sent on cross-site POSTs -> CSRF mitigation
        expires: expiresAt
    });
    return json({ ok: true, user: uname });
};
