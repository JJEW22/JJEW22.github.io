// src/routes/api/admin/users/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireAdmin } from '$lib/server/roles';
import { checkName } from '$lib/names';
import { AccountNameError, setAccountName } from '$lib/server/accountNames';
import type { RequestHandler } from './$types';

// List all accounts + their roles and names.  (site:admin only)
export const GET: RequestHandler = async ({ url, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    const rows = await sql`select id, username, email, roles, real_name from users order by username`;
    return json(rows);
};

// Update one account.  (site:admin only)
//   { "userId": 3, "roles": ["pickem:admin"] }  -> set the full role list
//   { "userId": 3, "name": "Vedant & Dina" }    -> override the person's name
//   { "userId": 3, "name": "" }                 -> clear it
export const POST: RequestHandler = async ({ url, request, locals }) => {
    requireAdmin(locals.user, url, 'site:admin');
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    if (!userId) return json({ ok: false, error: 'userId required.' }, { status: 400 });

    if ('name' in body) {
        let name: string | null = null;
        if (typeof body.name === 'string' && body.name.trim()) {
            const checked = checkName(body.name);
            if (!checked.ok) return json({ ok: false, error: checked.error }, { status: 400 });
            name = checked.value;
        }
        try {
            await setAccountName(userId, name);
        } catch (err) {
            if (err instanceof AccountNameError) {
                return json({ ok: false, error: err.message }, { status: err.status });
            }
            throw err;
        }
        return json({ ok: true, name });
    }

    const roles: string[] = Array.isArray(body.roles) ? body.roles.map(String) : [];
    await sql`update users set roles = ${roles} where id = ${userId}`;
    return json({ ok: true });
};
