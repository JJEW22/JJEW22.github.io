// src/lib/server/roles.ts
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { SessionUser } from '$lib/server/auth';

// site:admin implies every role.
export function hasRole(user: SessionUser | null, role: string): boolean {
    if (!user?.roles) return false;
    return user.roles.includes('site:admin') || user.roles.includes(role);
}

// Authorize an admin action. Passes if EITHER the request carries the correct
// SYNC_SECRET (the machine/cron path) OR the logged-in user holds `role`
// (the human/UI path). Otherwise throws 403.
//
// Machine callers should send the secret as an `x-sync-key` header. `?key=` still
// works for a hand-run curl, but a secret in a query string has to survive URL
// encoding (a raw `+` arrives as a space; `&` and `#` truncate it) and it lands in
// every access log between the caller and the app.
export function requireAdmin(
    user: SessionUser | null,
    url: URL,
    role: string,
    headers?: Headers
): void {
    // Trimmed on both sides: a secret pasted into a GitHub or Render settings field
    // easily picks up a trailing newline, which is invisible in those UIs.
    const key = (headers?.get('x-sync-key') ?? url.searchParams.get('key'))?.trim();
    const secret = env.SYNC_SECRET?.trim();
    if (secret && key === secret) return; // cron / curl
    if (hasRole(user, role)) return; // logged-in admin via UI
    // From outside, a 403 can't distinguish "wrong key" from "server has no
    // SYNC_SECRET", so leave a breadcrumb in the log. Lengths only, never values.
    if (key) {
        console.warn(
            secret
                ? `Admin key rejected for ${url.pathname}: got ${key.length} chars, expected ${secret.length}`
                : `Admin key rejected for ${url.pathname}: SYNC_SECRET is not set on this server`
        );
    }
    throw error(403, 'admin access required');
}