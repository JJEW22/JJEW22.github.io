// src/routes/api/auth/me/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Site-wide "who am I" — any feature/page can call this.
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ user: null });
    const u = (await sql`select username, email from users where id = ${locals.user.id}`)[0];
    return json({ user: u?.username ?? locals.user.username, email: u?.email ?? null });
};
