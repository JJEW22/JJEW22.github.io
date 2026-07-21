-- FILE: schema-membership.sql
-- Opt-in membership for the pickem competition + a custom display name.
-- Safe to run more than once.
alter table users add column if not exists pickem_joined_at timestamptz; -- null = not enrolled
alter table users add column if not exists display_name    text;         -- leaderboard name; falls back to username