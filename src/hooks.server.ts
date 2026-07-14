// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

// Runs on every request: turn the session cookie into event.locals.user so
// routes can trust `locals.user` for authorization.
export const handle: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get('session');
    event.locals.user = await validateSession(token);
    return resolve(event);
};