-- FILE: schema-admin-edits.sql
-- Admin editorial powers: an audit log of every override, plus the one flag the
-- scoring engine needs to represent a pick an admin placed that still carries the
-- auto-pick penalty. Safe to run more than once.

-- A pick normally means "the player chose this side", and no row at all means the
-- coin decided at AUTO_PICK_PENALTY fewer base points. An admin override needs a
-- third state: the player is on this side, but the penalty still applies. Defaults
-- to false, so every pick written before this migration keeps scoring as a real one.
alter table match_picks add column if not exists auto_penalty boolean not null default false;

-- Who changed what, for whom, and when. Nothing here is read by the scoring engine —
-- it exists so an override can be explained after the fact, in a competition where
-- there is a prize on the line.
create table if not exists admin_edits (
    id         bigint generated always as identity primary key,
    admin_id   bigint not null references users(id) on delete cascade,
    target_id  bigint not null references users(id) on delete cascade,
    kind       text not null,               -- 'pick' | 'season'
    fixture_id text,                        -- kind='pick': which match
    matchweek  int,
    before     jsonb,                       -- state prior to the override
    after      jsonb,                       -- state written
    note       text,                        -- optional reason typed by the admin
    created_at timestamptz not null default now()
);

create index if not exists admin_edits_created_idx on admin_edits (created_at desc);
create index if not exists admin_edits_target_idx on admin_edits (target_id);
