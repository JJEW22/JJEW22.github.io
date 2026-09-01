-- FILE: 014_fan_override.sql
-- Lets an admin pin one match's pick against the fan-team rule. Safe to run twice.

-- Scoring precedence has always been fan team > stored pick > coin, so a player's
-- club's matches are auto-picked to that club and any stored pick on them is ignored.
-- That is right going forward and wrong looking back: changing a fan team mid-season
-- re-wrote what the player had ALREADY picked on the new club's played matches.
--
-- This flag is the one exception, per fixture: "use the stored pick here even though
-- the fan team plays in it". Every pick an admin places retroactively sets it, so an
-- editorial decision survives any later fan-team change. Defaults to false, so every
-- pick written before this migration keeps scoring exactly as it did.
alter table match_picks add column if not exists fan_override boolean not null default false;
