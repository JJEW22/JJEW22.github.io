-- FILE: schema-season-predictions.sql
-- Season-prediction lock + golden/silver match bonus. Safe to run more than once.

-- First combined save timestamp (null = never saved). Locked = saved AND past deadline.
alter table users   add column if not exists predictions_saved_at timestamptz;
-- Per-match bonus designation for scoring: 'GOLDEN' | 'SILVER' | null.
alter table results add column if not exists bonus text;