// src/routes/api/auth/invite-info/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Returns the email an invite is bound to, so the signup form can show it locked.
export const GET: RequestHandler = async ({ url }) => {
    const token = url.searchParams.get('token') ?? '';
    if (!token) return json({ ok: false, error: 'Missing invite.' }, { status: 400 });
    const inv = (await sql`select email, used_by from invites where token = ${token}`)[0];
    if (!inv || !inv.email) return json({ ok: false, error: 'This invite link is invalid.' }, { status: 404 });
    if (inv.used_by) return json({ ok: false, error: 'This invite has already been used.' }, { status: 409 });
    return json({ ok: true, email: inv.email });
};
