// src/routes/api/auth/forgot/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { sendEmail } from '$lib/server/email';
import {
    MAX_RESETS_PER_HOUR,
    RESET_TTL_MS,
    createReset,
    recentSelfServiceCount,
    resetLink
} from '$lib/server/passwordReset';
import type { RequestHandler } from './$types';

// Ask for a reset link. Accepts an email OR a username, same as login.
export const POST: RequestHandler = async ({ request }) => {
    const { identifier } = await request.json().catch(() => ({}));
    const id = (identifier ?? '').trim().toLowerCase();
    if (!id) return json({ ok: false, error: 'Enter your email or username.' }, { status: 400 });

    const user = (
        await sql<{ id: number; email: string | null; username: string }[]>`
            select id, email, username from users
            where lower(username) = ${id} or lower(email) = ${id}`
    )[0];

    // Everything below is best-effort and deliberately invisible to the caller.
    // The response is identical whether or not the account exists, because a
    // different answer would turn this endpoint into a way to test which email
    // addresses are registered here.
    if (user?.email) {
        try {
            if ((await recentSelfServiceCount(Number(user.id))) < MAX_RESETS_PER_HOUR) {
                const { token } = await createReset(Number(user.id), RESET_TTL_MS);
                await sendEmail({
                    to: user.email,
                    subject: 'Reset your password',
                    text:
                        `Hi ${user.username},\n\n` +
                        `Someone asked to reset the password on your account. If that was you, ` +
                        `open this link within the hour:\n\n${resetLink(token)}\n\n` +
                        `It can only be used once. If it wasn't you, ignore this email — ` +
                        `your password hasn't changed.\n`
                });
            }
        } catch (err) {
            // A failure here must not change the response, or the timing/shape of
            // it becomes the enumeration oracle we just avoided.
            console.error('forgot: could not send reset link', err);
        }
    }

    return json({ ok: true });
};
