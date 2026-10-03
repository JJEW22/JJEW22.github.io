-- FILE: schema-krillion.sql
-- Krillion, rescored: a daily snapshot of krillion.io's answer counts and answer
-- sheet, the continuous score computed from it, and the dives players paste in.
-- Safe to run more than once.
--
-- Until Krillion's developer agrees to more, the site fetches ONCE a day (first
-- cron tick after 11am ET). The tables already allow several snapshots a day so
-- going hourly later is a change to the cron gate, not to the schema: scoring
-- always reads the latest snapshot for a date.

create table if not exists krillion_days (
    date        date primary key,              -- the dive's date in America/New_York
    day_number  int not null,                  -- Krillion's dive number (#1 = 2026-07-16)
    prompts     jsonb not null,                -- [{id, text}] in round order
    fetched_at  timestamptz not null,          -- when the snapshot was taken
    counts_as_of timestamptz,                  -- Krillion's own "asOf" for the counts
    model       jsonb not null,                -- per-prompt fit: {p1: {a, b, q, bottom, targets...}, ...}
    updated_at  timestamptz not null default now()
);

-- Every answer on the day's sheet or in its counts, with the updated score.
-- Replaced wholesale on each snapshot.
create table if not exists krillion_answers (
    date        date not null references krillion_days(date) on delete cascade,
    prompt_id   text not null,
    answer      text not null,                 -- as Krillion spells it
    count       int not null,                  -- players who gave it (0 = valid, unused)
    game_score  int,                           -- the game's points; null if the sheet groups it
    points      double precision not null,     -- the continuous, rescored points
    primary key (date, prompt_id, answer)
);
create index if not exists krillion_answers_lookup on krillion_answers (date, prompt_id, lower(answer));

-- A pasted (or typed) dive. Scored when the day's snapshot exists, re-scored on
-- every new snapshot, and emailed once the day is over if asked to.
create table if not exists krillion_submissions (
    id            bigint generated always as identity primary key,
    date          date not null,
    day_number    int not null,
    user_id       bigint references users(id) on delete cascade,
    -- Guests only. Cleared once the final-score email has gone out.
    email         text,
    notify        boolean not null default false,
    -- [{round, prompt, answer, typed, miss, gamePoints, othersChose}] as submitted
    rounds        jsonb not null,
    game_score    int,                         -- the game's total, from the paste
    game_better_than int,                      -- the game's "better than X%", from the paste
    -- [{round, promptId, match, points}] once scored
    scored        jsonb,
    updated_score double precision,
    scored_at     timestamptz,
    notified_at   timestamptz,
    created_at    timestamptz not null default now()
);
-- One dive per account per day: a resubmission replaces it.
create unique index if not exists krillion_submissions_user_day
    on krillion_submissions (user_id, date) where user_id is not null;
create index if not exists krillion_submissions_date on krillion_submissions (date);
create index if not exists krillion_submissions_to_notify
    on krillion_submissions (date) where notify and notified_at is null;
