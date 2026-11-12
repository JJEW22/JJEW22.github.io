-- FILE: 051_jpflicks_absences.sql
-- Who is missing on a league night, and that night's schedule, recorded by an admin.
-- Safe to run more than once.
--
-- The weekly schedule is worked out in the browser from a seed for the night,
-- and an absent team's scheduled games are swapped out (rebalanced) and, late
-- in the season, forfeited. That used to depend on every player hiding the
-- absent teams on their own screen. Storing them here means everyone sees the
-- same schedule for the night.
--
-- One row per absent team per night. Absence is by team, not player: marking a
-- player absent marks every team they play on.

create table if not exists jpflicks_absences (
    season_id bigint not null references jpflicks_seasons(id) on delete cascade,
    night date not null,
    team_id bigint not null references jpflicks_teams(id) on delete cascade,
    created_by bigint references users(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (season_id, night, team_id)
);

-- The night's starred games, frozen. Without this the stars are recomputed in
-- the browser from whatever is unplayed, so every result entered during the
-- night could reshuffle the rest. Locking a night stores its stars here and
-- every viewer reads them instead of recomputing.
--
-- Only the stars are stored. The replacement games for a missing team are
-- still worked out live, against these stars and the night's absences, so an
-- admin can change who is missing after the night is locked.
-- No rows for a night means it is not locked.

create table if not exists jpflicks_week_games (
    season_id bigint not null references jpflicks_seasons(id) on delete cascade,
    night date not null,
    match_id bigint not null references jpflicks_matches(id) on delete cascade,
    created_by bigint references users(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (season_id, night, match_id)
);
