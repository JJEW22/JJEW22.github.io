-- FILE: schema-odds.sql
-- Apply against your EXISTING Neon database. Adds raw decimal odds columns
-- (the multiplier columns already exist). Safe to run more than once.

alter table results add column if not exists odds_home numeric;
alter table results add column if not exists odds_away numeric;