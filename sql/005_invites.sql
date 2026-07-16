-- FILE: schema-invites.sql
-- Apply against your EXISTING Neon database. Adds invite-only account creation.
-- Safe to run more than once.

create table if not exists invites (
  token      text primary key,
  note       text,                                       -- optional label (who it's for)
  created_at timestamptz not null default now(),
  used_by    bigint references users(id) on delete set null,
  used_at    timestamptz
);