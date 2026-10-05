-- FILE: schema-krillion-breadth-range.sql
-- The all-time smallest and largest prompt breadth, for Krillion, rescored.
-- Safe to run more than once.
--
-- breadth = sqrt(answers on the prompt) / sum of squared answer shares. A
-- prompt's top score (what its rarest answer is worth) is placed along
-- 90..125 by where ln(breadth) sits between the all-time smallest (90) and the
-- all-time largest (125) -- log, because breadth spans orders of magnitude.
-- One row, widened whenever a newly scored day sets a record; backfilled from
-- the stored days' counts by the rescore endpoint.

-- Whether the day's SCHEDULED fetch has run. An admin's "Fetch now" refreshes a
-- day without setting it, so the 11am cron still runs on schedule. Days fetched
-- before this column existed were all fetched on schedule.
alter table krillion_days add column if not exists cron_fetched_at timestamptz;
update krillion_days set cron_fetched_at = fetched_at where cron_fetched_at is null;

create table if not exists krillion_breadth_range (
    id          smallint primary key default 1 check (id = 1),
    min_breadth double precision not null,
    min_date    date not null,
    min_prompt  text not null,
    max_breadth double precision not null,
    max_date    date not null,
    max_prompt  text not null,
    updated_at  timestamptz not null default now()
);
