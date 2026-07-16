// src/routes/api/admin/invites/+server.ts
import { json } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import type { RequestHandler } from './$types';

// Create email-bound invite links.
// Auth: a site:admin (via the /admin UI) OR ?key=<SYNC_SECRET> (curl).
export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    const body = await request.json().catch(() => ({}));
    const emails: string[] = Array.isArray(body.emails) ? body.emails : [];
    if (emails.length === 0) return json({ ok: false, error: 'Provide an "emails" array.' }, { status: 400 });

    const origin = env.ORIGIN ?? '';
    const created: { email: string; link: string }[] = [];
    for (const raw of emails) {
        const email = String(raw).trim().toLowerCase();
        if (!email) continue;
        const token = crypto.randomBytes(16).toString('base64url');
        await sql`insert into invites (token, email) values (${token}, ${email})`;
        created.push({ email, link: `${origin}/account?invite=${token}` });
    }
    return json({ ok: true, invites: created });
};

// List invites + status.
export const GET: RequestHandler = async ({ url, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    const rows = await sql`
        select i.email, i.token, i.created_at, i.used_at, u.username as used_by
        from invites i left join users u on u.id = i.used_by
        order by i.created_at desc`;
    return json(rows);
};