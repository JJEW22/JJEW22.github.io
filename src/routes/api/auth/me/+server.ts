// src/routes/api/auth/me/+server.ts
import { json } from '@sveltejs/kit';
import { getAccountName } from '$lib/server/accountNames';
import type { RequestHandler } from './$types';

// Site-wide "who am I" + roles, so any page can show/hide admin UI. `name` is
// the person's name on the account (null until set), separate from the username.
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ user: null, roles: [], name: null });
    return json({
        user: locals.user.username,
        roles: locals.user.roles,
        name: await getAccountName(locals.user.id)
    });
};
