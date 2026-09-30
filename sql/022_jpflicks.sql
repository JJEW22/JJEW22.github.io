-- FILE: schema-jpflicks.sql
-- The Crokinole league, moved off jpFlicksSeason*.xlsx and into the database so
-- results can be entered from the website and old seasons stay readable.
-- Safe to run more than once.
--
-- The spreadsheet stored each season as two N×N matrices (one per venue) with
-- every result written TWICE, once in each triangle, as a value and its
-- negation. That is the shape the page renders and it is a fine shape to
-- render; it is a bad shape to store, because the two halves are free to
-- disagree and nothing checks them. Here a match is one row, and the matrix is
-- generated from it at read time — so the triangles cannot drift apart.
--
-- The sentinels the sheet used are likewise not stored as text:
--   XXX       -> status 'disallowed' (the two teams share a player)
--   UNPLAYED  -> status 'unplayed'
--   F / -F    -> status 'final' with forfeit_by naming the team that forfeited
--   a number  -> status 'final' with margin, from team_a's point of view

create table if not exists jpflicks_seasons (
    id            bigint generated always as identity primary key,
    slug          text not null unique,      -- 'season-3', used in the URL
    label         text not null,             -- 'Season 3', shown on the tab
    season_number int not null,
    is_current    boolean not null default false,
    -- The two venues. Named per season because they are somebody's flat, and
    -- whose flat it is changes.
    home_venue    text not null default 'Council',
    away_venue    text not null default 'Anish',
    created_at    timestamptz not null default now()
);

create unique index if not exists jpflicks_seasons_one_current
    on jpflicks_seasons ((is_current)) where is_current;

create table if not exists jpflicks_teams (
    id         bigint generated always as identity primary key,
    season_id  bigint not null references jpflicks_seasons(id) on delete cascade,
    name       text not null,
    -- Preserves the column order the spreadsheet used, so an imported season
    -- renders in the order it always did rather than alphabetically.
    sort_order int not null default 0,
    -- Was static/jpFlicks/tournamentPoints.json, which had no season in it. On
    -- the team row it cannot be applied to the wrong season's standings.
    tournament_points numeric(5, 2) not null default 0,
    unique (season_id, name)
);

create table if not exists jpflicks_players (
    id      bigint generated always as identity primary key,
    team_id bigint not null references jpflicks_teams(id) on delete cascade,
    name    text not null,
    slot    int not null check (slot in (1, 2)),   -- 'Player 1' / 'Player 2'
    -- Set when a team is created, and only then. Imported seasons leave it null:
    -- those players are a name on an old scoresheet, not an account, and nothing
    -- in a finished season needs them to be one.
    user_id bigint references users(id) on delete set null,
    unique (team_id, slot)
);

create index if not exists jpflicks_players_user_idx on jpflicks_players (user_id);

create table if not exists jpflicks_matches (
    id        bigint generated always as identity primary key,
    season_id bigint not null references jpflicks_seasons(id) on delete cascade,
    venue     text not null check (venue in ('home', 'away')),
    -- team_a < team_b always, so a pairing has exactly one row and the unique
    -- index below is enough to prevent a duplicate fixture.
    team_a    bigint not null references jpflicks_teams(id) on delete cascade,
    team_b    bigint not null references jpflicks_teams(id) on delete cascade,

    status    text not null default 'unplayed'
              check (status in ('unplayed', 'disallowed', 'pending', 'final')),

    -- The result, always from team_a's point of view: positive means team_a won
    -- by that many. A tie is 0, which is why nothing here may test margin for
    -- truthiness.
    margin     int,
    forfeit_by bigint references jpflicks_teams(id) on delete set null,

    -- 'pending' means one side has entered a score and the other has not yet
    -- agreed. The result sits in margin/forfeit_by while it waits, and the
    -- matrix keeps reporting the match as unplayed until it is approved — an
    -- unconfirmed score must not move the standings.
    submitted_by bigint references users(id) on delete set null,
    -- Which SIDE entered it, recorded rather than looked up from the submitter's
    -- roster entry: approval turns on the approver being on the other team, and
    -- that test must not change meaning if somebody's roster spot later does.
    -- Null when an admin entered it without playing in the match.
    submitted_team bigint references jpflicks_teams(id) on delete set null,
    submitted_at timestamptz,
    approved_by  bigint references users(id) on delete set null,
    approved_at  timestamptz,

    constraint jpflicks_distinct_teams check (team_a < team_b),
    -- A result is either a margin or a forfeit, never both and never neither,
    -- and only once something has been entered.
    constraint jpflicks_result_shape check (
        case
            when status in ('pending', 'final')
                then (margin is not null) <> (forfeit_by is not null)
            else margin is null and forfeit_by is null
        end
    )
);

create unique index if not exists jpflicks_matches_fixture
    on jpflicks_matches (season_id, venue, team_a, team_b);

create index if not exists jpflicks_matches_season_idx
    on jpflicks_matches (season_id, status);

-- Added after the table shipped; harmless on a fresh database, which already
-- has the column from the definition above.
alter table jpflicks_matches
    add column if not exists submitted_team bigint references jpflicks_teams(id) on delete set null;
