-- sql/036_ultra_race_clock.sql
-- The race clock, set from /ultra/admin ("Start the race now", "End the race
-- now", or any time typed in). Overrides RACE.start in $lib/ultra; with no
-- end, the window closes at start + RACE.cutoffHours. Safe to run more than once.
alter table ultra_settings add column if not exists race_start timestamptz;
alter table ultra_settings add column if not exists race_end timestamptz;
