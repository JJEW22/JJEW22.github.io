-- FILE: schema-swim-spot-dates.sql
-- A spot can be swum more than once -- a regular swimming hole gets a date per
-- visit. Still one row per SPOT in swim_spots (one dot on the map); the dates
-- are a child table, which is what 020_swim_spots.sql said per-swim history
-- would need.
-- Safe to run more than once.
--
-- swim_spots.swum_on stays, always holding the MOST RECENT date (null if none),
-- so "newest swim first" is still a plain column sort. The API keeps the two in
-- step on every save; this table is the full record.

create table if not exists swim_spot_dates (
    spot_id bigint not null references swim_spots(id) on delete cascade,
    swum_on date not null,
    primary key (spot_id, swum_on)
);

-- Every spot's existing date becomes its first entry.
insert into swim_spot_dates (spot_id, swum_on)
select id, swum_on from swim_spots where swum_on is not null
on conflict do nothing;
