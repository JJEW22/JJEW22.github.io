-- FILE: schema-password-resets.sql
-- One-shot, expiring links that let someone set a new password without knowing
-- the old one. Safe to run more than once.
--
-- The raw token is NEVER stored, only its SHA-256 — same rule as `sessions`.
-- A leaked database dump then contains nothing that can be replayed as a link.
create table if not exists password_resets (
    token_hash text primary key,                 -- sha256(token); the token itself is only ever in the link
    user_id    bigint not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    used_at    timestamptz,                      -- set the moment it is spent; null = still live
    -- Which admin minted it, for a link handed over by hand. Null means the
    -- person asked for it themselves through /account.
    created_by bigint references users(id) on delete set null,
    created_at timestamptz not null default now()
);

-- Supports both the rate-limit count ("how many has this account asked for in
-- the last hour") and invalidating every outstanding link once one is spent.
create index if not exists password_resets_user_idx on password_resets (user_id, created_at desc);
