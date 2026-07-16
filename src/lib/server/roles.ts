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
export function requireAdmin(user: SessionUser | null, url: URL, role: string): void {
    const key = url.searchParams.get('key');
    if (env.SYNC_SECRET && key === env.SYNC_SECRET) return; // cron / curl
    if (hasRole(user, role)) return; // logged-in admin via UI
    throw error(403, 'admin access required');
}