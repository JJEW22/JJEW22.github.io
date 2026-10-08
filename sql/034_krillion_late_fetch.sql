-- sql/034_krillion_late_fetch.sql
-- A second scheduled fetch each day, at 11pm ET, so the counts the final
-- scores (and the after-midnight emails) use are close to the day's end.
-- cron_fetched_at stays the 11am fetch; this marks the 11pm one.
-- Safe to run more than once.
alter table krillion_days add column if not exists late_fetched_at timestamptz;
