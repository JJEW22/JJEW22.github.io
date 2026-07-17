-- FILE: schema-goals.sql
-- Store goals on results so the league table (and any table-based features) can
-- be derived from match data rather than snapshotted. Safe to run more than once.

alter table results add column if not exists home_goals int;
alter table results add column if not exists away_goals int;