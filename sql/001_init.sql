-- Run this once against your Postgres (Supabase SQL editor, or `psql < schema.sql`).

create table if not exists users (
  id            bigint generated always as identity primary key,
  username      text unique not null,
  password_hash text not null,           -- Argon2id hash; never the raw code
  created_at    timestamptz not null default now()
);

-- Server-side sessions. We store only the SHA-256 of the token, so a DB leak
-- does not hand out live sessions. The raw token lives only in the user's cookie.
create table if not exists sessions (
  token_hash text primary key,
  user_id    bigint not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists match_picks (
  user_id    bigint not null references users(id) on delete cascade,
  matchweek  int not null,
  fixture_id text not null,
  pick       text not null check (pick in ('HOME','AWAY')),
  updated_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);

create table if not exists table_predictions (
  user_id    bigint primary key references users(id) on delete cascade,
  team_order jsonb not null,
  updated_at timestamptz not null default now()
);

-- Finished-match results, filled by a sync job (see SETUP.md). The leaderboard
-- scores picks against this table so you are never scoring live/unfinished games.
create table if not exists results (
  fixture_id text primary key,
  matchweek  int not null,
  winner     text,          -- 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW'
  updated_at timestamptz not null default now()
);