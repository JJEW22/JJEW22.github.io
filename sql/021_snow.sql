-- FILE: schema-snow.sql
-- First-snow predictions, moved out of a hardcoded array in +page.svelte and
-- into the database so past seasons survive and this year's can be submitted.
-- Safe to run more than once.
--
-- Two things are deliberately NOT columns:
--
--   1. The winner. It is whoever's predicted_date is nearest first_snow, which
--      $lib/snow computes the same way for every season. The old page stored it
--      as `finalWinner` alongside the list it was supposed to summarise, and the
--      two drifted: the array had Aidan & Na'ama on Dec 14 and Haneen & Sandy on
--      Dec 15, actualSnowDate said Dec 15, and finalWinner still named Aidan &
--      Na'ama with 0 days off. Derived, it cannot disagree with itself.
--
--   2. Whether a season is locked. That is `first_snow is not null or today >
--      deadline` — state that changes without anyone touching the row, so
--      storing it would need something to run at the deadline to stay true.

create table if not exists snow_seasons (
    id         bigint generated always as identity primary key,
    slug       text not null unique,        -- '2025-26', used in the URL
    label      text not null,               -- '2025–26', shown on the tab
    -- Last day a prediction may be added or changed. Null means the season stays
    -- open until the snow is recorded, which is how the imported season ran.
    deadline   date,
    first_snow date,                        -- null until it actually snows
    is_current boolean not null default false,
    created_at timestamptz not null default now()
);

-- Exactly one season can be the current one. A partial unique index says that in
-- the schema rather than leaving it to whichever endpoint last wrote a row.
create unique index if not exists snow_seasons_one_current
    on snow_seasons ((is_current)) where is_current;

create table if not exists snow_predictions (
    id             bigint generated always as identity primary key,
    season_id      bigint not null references snow_seasons(id) on delete cascade,
    -- Null for everyone imported from the old page, and for anyone the admin
    -- enters on behalf of who has no account. The name is what gets displayed
    -- either way, so an entry never depends on an account existing.
    user_id        bigint references users(id) on delete set null,
    display_name   text not null,
    predicted_date date not null,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- One prediction per account per season. Partial, because the null user_ids of
-- the imported rows would otherwise all collide.
create unique index if not exists snow_predictions_one_per_user
    on snow_predictions (season_id, user_id) where user_id is not null;

-- And one per name, case-insensitively, so an admin entering someone on their
-- behalf finds out rather than quietly creating a second "Nick".
create unique index if not exists snow_predictions_one_per_name
    on snow_predictions (season_id, lower(display_name));

create index if not exists snow_predictions_season_idx
    on snow_predictions (season_id, predicted_date);

-- ---------------------------------------------------------------------------
-- The 2025–26 season, as it stood on the page.
--
-- first_snow is Dec 14, the day it actually snowed. The old page had Dec 15 in
-- actualSnowDate with the comment "snowed on 14th but it was rounding down?" —
-- that was a workaround for mixing `new Date("2025-12-15")` (parsed as UTC) with
-- `new Date(y, m-1, d)` (local), which shifts a date a day backwards west of
-- Greenwich. $lib/snow parses every date at UTC midnight, so the workaround is
-- not needed and the true date is what goes in.

insert into snow_seasons (slug, label, deadline, first_snow, is_current)
values ('2025-26', '2025–26', null, '2025-12-14', false)
on conflict (slug) do nothing;

insert into snow_predictions (season_id, display_name, predicted_date)
select s.id, v.name, v.day::date
from snow_seasons s
cross join (values
    ('Jack',           '2025-11-29'),
    ('Katelyn',        '2025-11-18'),
    ('Shawty',         '2025-12-03'),
    ('Moll Ball',      '2025-12-08'),
    ('Anish',          '2025-12-11'),
    ('Tea',            '2025-12-12'),
    ('Vedant & Dina',  '2025-12-13'),
    ('Aidan & Na''ama','2025-12-14'),
    ('Haneen & Sandy', '2025-12-15'),
    ('Sam',            '2025-12-22'),
    ('Nick',           '2025-12-25'),
    -- Spelled "Calude" on the live page; kept as-is rather than silently
    -- corrected, since the admin page can rename it.
    ('Calude',         '2026-01-18')
) as v(name, day)
where s.slug = '2025-26'
on conflict do nothing;

-- This season, open for submissions. The deadline is a starting guess — last
-- season's earliest prediction was Nov 18 — and is editable at /snow/admin.
insert into snow_seasons (slug, label, deadline, first_snow, is_current)
values ('2026-27', '2026–27', '2026-11-15', null, true)
on conflict (slug) do nothing;
