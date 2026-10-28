-- FILE: schema-krillion-guest-names.sql
-- Guests on the Krillion daily leaderboard. A guest's dive carries the name
-- they gave when submitting, or a random tag ("Guest-K7Q2") if they left it
-- blank. Signed-in dives leave it null: their name is the account's.
-- Dives guests made before this have none and show as "Guest".
-- Safe to run more than once.
alter table krillion_submissions add column if not exists guest_name text;
