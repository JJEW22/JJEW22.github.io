// src/routes/api/auth/reset/+server.ts
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { hashPassword, createSession } from '$lib/server/auth';
import { consumeReset, peekReset } from '$lib/server/passwordReset';
import type { RequestHandler } from './$types';

const DEAD_LINK = 'This reset link is invalid, expired, or has already been used.';

// Check a link before showing the form, so a dead one is caught up front rather
// than after someone has chosen a password. Reveals only the username, and only
// to whoever already holds the token.
export const GET: RequestHandler = async ({ url }) => {
    const found = await peekReset(url.searchParams.get('token') ?? '');
    if (!found) return json({ ok: false, error: DEAD_LINK }, { status: 404 });
    return json({ ok: true, username: found.username });
};

// Spend the link and set the new password.
export const POST: RequestHandler = async ({ request, cookies }) => {
    const { token, password } = await request.json().catch(() => ({}));
    if (!token) return json({ ok: false, error: DEAD_LINK }, { status: 400 });
    // Same floor as register, so a reset can never leave someone with a password
    // they wouldn't have been allowed to sign up with.
    if ((password ?? '').length < 4) {
        return json({ ok: false, error: 'Password needs 4+ characters.' }, { status: 400 });
    }

    const userId = await consumeReset(token, await hashPassword(password));
    if (!userId) return json({ ok: false, error: DEAD_LINK }, { status: 409 });

    // consumeReset cleared every session this account had, including any the
    // person is sitting in right now, so issue a fresh one and sign them in.
    const { token: sessionToken, expiresAt } = await createSession(userId);
    cookies.set('session', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: !dev,
        sameSite: 'lax',
        expires: expiresAt
    });
    return json({ ok: true });
};
