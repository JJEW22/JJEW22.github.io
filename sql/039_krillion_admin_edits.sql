-- sql/039_krillion_admin_edits.sql
-- Who last changed a Krillion dive on a player's behalf, from the admin page.
-- Safe to run more than once.
--
-- An admin can enter or fix a player's answers (and does so past the 12:15am
-- submission deadline); the dive keeps its player, and these record the edit.

alter table krillion_submissions add column if not exists edited_by bigint references users(id) on delete set null;
alter table krillion_submissions add column if not exists edited_at timestamptz;
