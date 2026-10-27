-- FILE: schema-housing-map-ratings.sql
-- Map coordinates and admin ratings for the houses on /housing.
-- Safe to run more than once.

-- Where the house is, for the map. Geocoded from the address by the US Census
-- geocoder (free, no key), or taken from RentCast's property record. Null when
-- neither could place it. geocoded_at records the attempt either way, so an
-- address the geocoder can't match isn't retried on every page load; editing
-- the address clears it.
alter table housing_houses add column if not exists lat double precision;
alter table housing_houses add column if not exists lng double precision;
alter table housing_houses add column if not exists geocoded_at timestamptz;

-- Each admin's feeling about each house: one rating per person per house.
create table if not exists housing_house_ratings (
    house_id   bigint not null references housing_houses(id) on delete cascade,
    user_id    bigint not null references users(id) on delete cascade,
    score      smallint not null check (score between 1 and 5),
    comment    text not null default '',
    updated_at timestamptz not null default now(),
    primary key (house_id, user_id)
);
