-- sql/032_ultra.sql
-- Live ultra tracking: GPS points posted by the Overland iOS app.
-- Safe to run more than once.
--
-- Every point the phone sends is kept; the public page only ever shows the
-- points inside the race window (see $lib/ultra RACE), so leaving the app
-- running before or after the race doesn't publish where you are.

create table if not exists ultra_points (
    id           bigint generated always as identity primary key,
    device_id    text not null default '',
    recorded_at  timestamptz not null,           -- when the phone took the fix
    lat          double precision not null,
    lon          double precision not null,
    altitude     double precision,               -- metres
    speed        double precision,               -- m/s, as the phone reports it
    accuracy     double precision,               -- horizontal, metres
    battery      double precision,               -- 0..1
    received_at  timestamptz not null default now()
);

-- Overland resends a batch it never got an "ok" for; the duplicate fixes are
-- dropped on insert.
create unique index if not exists ultra_points_device_time
    on ultra_points (device_id, recorded_at);
create index if not exists ultra_points_time on ultra_points (recorded_at);
