// src/routes/api/admin/users/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import type { RequestHandler } from './$types';

// List all accounts + their roles.  (site:admin only)
export const GET: RequestHandler = async ({ url, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    const rows = await sql`select id, username, email, roles from users order by username`;
    return json(rows);
};

// Set the full role list for one account.  (site:admin only)
// Body: { "userId": 3, "roles": ["pickem:admin"] }
export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    const roles: string[] = Array.isArray(body.roles) ? body.roles.map(String) : [];
    if (!userId) return json({ ok: false, error: 'userId required.' }, { status: 400 });
    await sql`update users set roles = ${roles} where id = ${userId}`;
    return json({ ok: true });
};