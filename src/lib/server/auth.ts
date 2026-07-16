// src/lib/server/auth.ts
import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { sql } from '$lib/server/db';

export interface SessionUser {
    id: number;
    username: string;
    roles: string[];
}

const SESSION_DAYS = 30;

// Argon2id is memory-hard, so brute-forcing stolen hashes is expensive.
export function hashPassword(raw: string): Promise<string> {
    return argonHash(raw); // @node-rs/argon2 defaults to argon2id
}
export function verifyPassword(storedHash: string, raw: string): Promise<boolean> {
    return argonVerify(storedHash, raw);
}

// We hand the user a random token but only ever store its hash.
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await sql`insert into sessions (token_hash, user_id, expires_at)
              values (${hashToken(token)}, ${userId}, ${expiresAt})`;
    return { token, expiresAt };
}

export async function validateSession(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const rows = await sql`
        select s.user_id, s.expires_at, u.username, u.roles
        from sessions s join users u on u.id = s.user_id
        where s.token_hash = ${hashToken(token)}`;
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
        await sql`delete from sessions where token_hash = ${hashToken(token)}`;
        return null;
    }
    return {
        id: Number(row.user_id),
        username: row.username as string,
        roles: (row.roles as string[]) ?? []
    };
}

export async function deleteSession(token: string | undefined): Promise<void> {
    if (token) await sql`delete from sessions where token_hash = ${hashToken(token)}`;
}