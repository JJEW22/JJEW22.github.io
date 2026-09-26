// src/lib/server/passwordReset.ts
// Minting and spending password-reset links.
//
// Two ways in, one mechanism: the person asks for one themselves at /account, or
// a site:admin mints one from /admin and hands it over. Both produce the same
// single-use, expiring row — only the delivery and the lifetime differ.
//
// The raw token exists in the link and nowhere else; the table holds its SHA-256,
// exactly as sessions do.

import { env } from '$env/dynamic/private';
import { sql } from '$lib/server/db';
import { hashToken, newToken } from '$lib/server/auth';

// Self-service: the link is in their inbox already, so it doesn't need to live long.
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
// Admin-minted: it has to survive being copied into a text message and read later,
// so it gets a day. Still single-use, and still invalidated by the next reset.
export const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000;

// Per account, per hour. Stops the endpoint being used to flood someone's inbox
// (or to burn through the Resend quota) without needing rate-limit infrastructure.
export const MAX_RESETS_PER_HOUR = 3;

export function resetLink(token: string): string {
    return `${env.ORIGIN ?? ''}/account?reset=${token}`;
}

export async function createReset(
    userId: number,
    ttlMs: number,
    createdBy: number | null = null
): Promise<{ token: string; expiresAt: Date }> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    await sql`
        insert into password_resets (token_hash, user_id, expires_at, created_by)
        values (${hashToken(token)}, ${userId}, ${expiresAt}, ${createdBy})`;
    return { token, expiresAt };
}

// How many links this account has been sent in the last hour, for the rate limit.
// Admin-minted ones don't count: an admin asking twice is deliberate, and locking
// yourself out of the manual escape hatch defeats its purpose.
export async function recentSelfServiceCount(userId: number): Promise<number> {
    const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from password_resets
        where user_id = ${userId}
          and created_by is null
          and created_at > now() - interval '1 hour'`;
    return rows[0]?.n ?? 0;
}

// Look a link up without spending it, so the form can greet the right person and
// reject a dead link before they type a password.
export async function peekReset(token: string): Promise<{ username: string } | null> {
    if (!token) return null;
    const rows = await sql<{ username: string }[]>`
        select u.username
        from password_resets r join users u on u.id = r.user_id
        where r.token_hash = ${hashToken(token)} and r.used_at is null and r.expires_at > now()`;
    return rows[0] ?? null;
}

/**
 * Spend a link and set the new password. Returns the user id, or null if the
 * token was unknown, expired, or already used.
 *
 * The whole thing is one transaction, and the first statement is a conditional
 * UPDATE ... RETURNING — so two submissions of the same link race on a single row
 * lock and exactly one of them wins. A read-then-write would let both through.
 */
export async function consumeReset(token: string, passwordHash: string): Promise<number | null> {
    if (!token) return null;
    return sql.begin(async (tx) => {
        const claimed = await tx<{ user_id: number }[]>`
            update password_resets set used_at = now()
            where token_hash = ${hashToken(token)}
              and used_at is null
              and expires_at > now()
            returning user_id`;
        if (!claimed.length) return null;
        const userId = Number(claimed[0].user_id);

        await tx`update users set password_hash = ${passwordHash} where id = ${userId}`;

        // Any other link outstanding for this account is now stale — including the
        // one an admin may have minted in parallel.
        await tx`
            update password_resets set used_at = now()
            where user_id = ${userId} and used_at is null`;

        // Sign out everywhere. If the reset happened because someone else got into
        // the account, leaving their session alive would make the reset pointless.
        await tx`delete from sessions where user_id = ${userId}`;

        return userId;
    });
}
