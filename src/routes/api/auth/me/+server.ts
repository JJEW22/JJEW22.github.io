// src/routes/api/auth/me/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Site-wide "who am I" + roles, so any page can show/hide admin UI.
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ user: null, roles: [] });
    return json({ user: locals.user.username, roles: locals.user.roles });
};