-- FILE: schema-pizza-bracket.sql
-- The pizza bracket, moved out of static JSON + xlsx and into the database so it
-- can be edited from /pizzaBracket/admin instead of by re-running a Python script.
-- Safe to run more than once.
--
-- Two decisions are baked into this shape:
--
--   1. Teams are rows with ids, and ratings reference those ids. The old pipeline
--      keyed everything by team NAME, which is what silently broke Mission Hill:
--      the column map said "Il Mondo'" where the bracket said "Il Mondo's", the
--      names failed to match, and a 3-team match quietly scored as a 2-team one.
--      With an id, renaming a pizzeria is a one-row update that its ratings follow.
--
--   2. Advancement is DERIVED, never stored. A slot that names a source match has
--      no team of its own; whoever wins that match occupies it at read time. The
--      old script wrote winners forward into later rounds, which meant the file
--      held state that had to be regenerated to stay true. Nothing to propagate
--      here, so nothing can go stale. (Same instinct as coinPick in the pickem
--      scoring: derive it, don't store it.)

create table if not exists pizza_brackets (
    id          bigint generated always as identity primary key,
    slug        text not null unique,       -- 'jp-2025', used in URLs
    name        text not null,
    description text,
    is_active   boolean not null default false,  -- the one /pizzaBracket renders
    created_at  timestamptz not null default now()
);

-- The pizzerias. Scoped to a bracket so next year's list is independent.
create table if not exists pizza_teams (
    id         bigint generated always as identity primary key,
    bracket_id bigint not null references pizza_brackets(id) on delete cascade,
    name       text not null,
    unique (bracket_id, name)
);

create table if not exists pizza_divisions (
    id         bigint generated always as identity primary key,
    bracket_id bigint not null references pizza_brackets(id) on delete cascade,
    name       text not null,
    color      text,                        -- hex, drives the division accent
    sort_order int not null default 0,
    unique (bracket_id, name)
);

create table if not exists pizza_matches (
    id          bigint generated always as identity primary key,
    bracket_id  bigint not null references pizza_brackets(id) on delete cascade,
    division_id bigint references pizza_divisions(id) on delete cascade,  -- null = finals
    round_name  text not null,              -- 'Round 1', 'Division Final', 'Championship'
    round_order int not null default 0,     -- bracket-wide, so rounds sort across divisions
    match_key   text not null,              -- 'A-R1-triple' — stable, carried over from the JSON
    -- 'triple' scores differently from 'standard' (drop the lowest average, then a
    -- straight 2-team vote), so it is stated rather than inferred from slot count.
    kind        text not null default 'standard',
    sort_order  int not null default 0,
    -- Null means "whatever the ratings say". Set only when an admin overrules the
    -- computation — an unrated matchup that has to resolve, or a perfect tie, which
    -- the old script settled by silently defaulting to the first team.
    winner_override_team_id bigint references pizza_teams(id) on delete set null,
    override_note text,
    unique (bracket_id, match_key),
    constraint pizza_matches_kind_ck check (kind in ('standard', 'triple'))
);

-- One row per position in a match. A slot holds EITHER a team outright (a seeded
-- entrant or a bye) OR a source match whose winner fills it later.
create table if not exists pizza_slots (
    id              bigint generated always as identity primary key,
    match_id        bigint not null references pizza_matches(id) on delete cascade,
    slot_index      int not null,
    team_id         bigint references pizza_teams(id) on delete set null,
    seed            int,
    source_match_id bigint references pizza_matches(id) on delete set null,
    is_bye          boolean not null default false,   -- 1-seed sitting out round 1
    unique (match_id, slot_index)
);

-- Voters are free text, not site accounts: people rate pizza at a table, and most
-- of them have never logged in. user_id is there for the day that changes.
create table if not exists pizza_voters (
    id         bigint generated always as identity primary key,
    bracket_id bigint not null references pizza_brackets(id) on delete cascade,
    name       text not null,
    user_id    bigint references users(id) on delete set null,
    sort_order int not null default 0,
    unique (bracket_id, name)
);

-- The raw input, and the only thing the admin page really writes. Keyed by match
-- as well as team because a pizzeria can appear in several rounds and each round
-- is rated fresh.
create table if not exists pizza_ratings (
    match_id   bigint not null references pizza_matches(id) on delete cascade,
    team_id    bigint not null references pizza_teams(id) on delete cascade,
    voter_id   bigint not null references pizza_voters(id) on delete cascade,
    rating     numeric(3, 1) not null,
    updated_at timestamptz not null default now(),
    primary key (match_id, team_id, voter_id),
    constraint pizza_ratings_range_ck check (rating >= 0 and rating <= 5)
);

create index if not exists pizza_matches_bracket_idx on pizza_matches (bracket_id, round_order, sort_order);
create index if not exists pizza_slots_match_idx on pizza_slots (match_id, slot_index);
create index if not exists pizza_ratings_match_idx on pizza_ratings (match_id);
