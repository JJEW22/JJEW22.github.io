-- sql/037_ultra_test_race.sql
-- The tracker's race switch: which race the public page shows ('main', the
-- real race, or 'test', a practice course), and the test race's own clock.
-- The main race keeps race_start / race_end, so its clock is untouched.
-- Safe to run more than once.
alter table ultra_settings add column if not exists active_race text not null default 'main';
alter table ultra_settings add column if not exists test_race_start timestamptz;
alter table ultra_settings add column if not exists test_race_end timestamptz;
