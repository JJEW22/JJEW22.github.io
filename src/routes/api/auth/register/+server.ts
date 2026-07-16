// src/routes/api/auth/register/+server.ts
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sql } from '$lib/server/db';
import { hashPassword, createSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// Invite-bound signup. The email comes from the invite (locked), the person
// chooses username + password. Invite consumed atomically -> one link, one account.
export const POST: RequestHandler = async ({ request, cookies }) => {
    const { invite, username, password } = await request.json();
    const uname = (username ?? '').trim().toLowerCase();
    if (!invite) return json({ ok: false, error: 'An invite is required.' }, { status: 400 });
    if (uname.length < 2 || (password ?? '').length < 4) {
        return json({ ok: false, error: 'Username needs 2+ chars, password needs 4+.' }, { status: 400 });
    }

    const inv = (await sql`select email from invites where token = ${invite} and used_by is null`)[0];
    if (!inv || !inv.email) {
        return json({ ok: false, error: 'This invite link is invalid or already used.' }, { status: 409 });
    }
    const email = String(inv.email).toLowerCase();

    if ((await sql`select 1 from users where email = ${email}`)[0]) {
        return json({ ok: false, error: 'An account already exists for this email.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    let userId: number;
    try {
        userId = await sql.begin(async (tx) => {
            const u = (await tx`
                insert into users (email, username, password_hash)
                values (${email}, ${uname}, ${passwordHash}) returning id`)[0];
            const claimed = await tx`
                update invites set used_by = ${Number(u.id)}, used_at = now()
                where token = ${invite} and used_by is null returning token`;
            if (claimed.length === 0) throw new Error('INVALID_INVITE');
            return Number(u.id);
        });
    } catch (e: any) {
        if (e?.message === 'INVALID_INVITE') {
            return json({ ok: false, error: 'This invite link is invalid or already used.' }, { status: 409 });
        }
        if (e?.code === '23505') {
            return json({ ok: false, error: 'That username is taken — pick another.' }, { status: 409 });
        }
        throw e;
    }

    const { token, expiresAt } = await createSession(userId);
    cookies.set('session', token, { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax', expires: expiresAt });
    return json({ ok: true });
};
