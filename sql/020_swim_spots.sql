-- FILE: schema-swim-spots.sql
-- Every place in the world I've swum, for the map at /meSoup.
-- Safe to run more than once.
--
-- One row per SPOT, not per swim. The page answers "where have I swum", so a
-- second dip in the same lake is the same dot; `swum_on` is when that spot was
-- first (or most memorably) swum. If per-swim history is ever wanted, it belongs
-- in a child table rather than as duplicate dots stacked on one coordinate.
--
-- `water_type` is deliberately NOT a CHECK constraint or an enum. $lib/swimSpots
-- owns the list -- labels, legend colors and validation all read from it, and the
-- API is the only writer -- so a CHECK here would be a second copy of that list
-- free to drift from the first. Same reasoning as the scoring constants living in
-- one module instead of being redeclared per call site.

create table if not exists swim_spots (
    id         bigint generated always as identity primary key,
    name       text not null,
    -- Plain lat/lon rather than PostGIS: the only query is "give me all of them",
    -- and d3-geo projects from degrees anyway.
    lat        double precision not null check (lat between -90 and 90),
    lon        double precision not null check (lon between -180 and 180),
    swum_on    date,                       -- null = swum, date forgotten
    water_type text not null default 'other',
    country    text,                       -- stored, not derived from the coordinate,
    region     text,                       -- so the counts don't need a reverse geocoder
    note       text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- The map renders newest-first in the list beside it, and nulls sort last there.
create index if not exists swim_spots_swum_on_idx on swim_spots (swum_on desc nulls last);
