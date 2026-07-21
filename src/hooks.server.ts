// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

// Runs on every request: turn the session cookie into event.locals.user so
// routes can trust `locals.user` for authorization.
export const handle: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get('session');
    try {
        event.locals.user = await validateSession(token);
    } catch (err) {
        // A transient DB/DNS hiccup (e.g. right after the host wakes from sleep and
        // the network isn't ready yet) shouldn't 500 every request — this hook runs
        // for static assets like favicon.ico too. Degrade to anonymous for this one
        // request; anything that genuinely needs the DB will still surface its own error.
        console.error('Session lookup failed; treating request as anonymous:', err);
        event.locals.user = null;
    }
    return resolve(event);
};