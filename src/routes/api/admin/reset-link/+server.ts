// src/routes/api/admin/reset-link/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import { ADMIN_RESET_TTL_MS, createReset, resetLink } from '$lib/server/passwordReset';
import type { RequestHandler } from './$types';

// Mint a reset link for someone and hand it back to the admin to deliver.
//
// The manual counterpart to /api/auth/forgot, and the only one that works with no
// mail provider configured — which is the whole point: it covers a bounced
// address, a lost inbox, and the stretch before a sending domain is verified.
//
// (site:admin only)
export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    // requireAdmin also passes on a valid SYNC_SECRET, which carries no user, and
    // created_by should name a real person.
    if (!locals.user) return json({ ok: false, error: 'Sign in as an admin.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    if (!userId) return json({ ok: false, error: 'userId required.' }, { status: 400 });

    const target = (
        await sql<{ id: number; username: string }[]>`
            select id, username from users where id = ${userId}`
    )[0];
    if (!target) return json({ ok: false, error: 'No such account.' }, { status: 404 });

    const { token, expiresAt } = await createReset(
        Number(target.id),
        ADMIN_RESET_TTL_MS,
        locals.user.id
    );

    return json({
        ok: true,
        username: target.username,
        link: resetLink(token),
        expiresAt: expiresAt.toISOString()
    });
};
