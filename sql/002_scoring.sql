-- Apply against your EXISTING Neon database (you already ran schema.sql).
-- Adds the columns the scoring engine needs. Safe to run more than once.

alter table users   add column if not exists fan_team  text;

alter table results add column if not exists home_id   text;
alter table results add column if not exists away_id   text;
alter table results add column if not exists mult_home numeric not null default 1;
alter table results add column if not exists mult_away numeric not null default 1;