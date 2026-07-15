-- FILE: schema-probs.sql
-- Apply against your EXISTING Neon database. Adds de-vigged probability columns
-- used for the percentage + draw display. Safe to run more than once.

alter table results add column if not exists prob_home numeric;
alter table results add column if not exists prob_draw numeric;
alter table results add column if not exists prob_away numeric;