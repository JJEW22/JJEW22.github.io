-- sql/035_ultra_show_battery.sql
-- Whether the public tracker shows each phone's battery %. Safe to run more
-- than once.
alter table ultra_settings add column if not exists show_battery boolean not null default true;
