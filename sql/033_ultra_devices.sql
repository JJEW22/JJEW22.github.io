-- sql/033_ultra_devices.sql
-- Ultra tracker admin: who's shown, and when. Safe to run more than once.
--
-- A "device" is the Overland Device ID a phone sends with its points. Points
-- arrive from any phone with the token; only devices switched on here are
-- ever public, and new ones start hidden.

create table if not exists ultra_devices (
    device_id   text primary key,
    name        text,                         -- shown on the public page
    color       text,                         -- #rrggbb for the map line
    shown       boolean not null default false,
    created_at  timestamptz not null default now()
);

-- Every device that has already sent points.
insert into ultra_devices (device_id)
select distinct device_id from ultra_points
on conflict (device_id) do nothing;

-- One row: what the public page shows.
--   off  -- nothing
--   race -- the race window from RACE in $lib/ultra
--   live -- everything since live_since (set when live was switched on)
create table if not exists ultra_settings (
    id          int primary key default 1 check (id = 1),
    mode        text not null default 'race' check (mode in ('off', 'race', 'live')),
    live_since  timestamptz,
    updated_at  timestamptz not null default now()
);
insert into ultra_settings (id) values (1) on conflict (id) do nothing;
