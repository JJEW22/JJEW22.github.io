-- FILE: schema-housing-eliminate.sql
-- Eliminating a house on /housing: it drops off the main list and the map, and
-- the weekly RentCast listing check skips it. Nothing is deleted, so it can be
-- shown again and restored, ratings and all. Safe to run more than once.
alter table housing_houses add column if not exists eliminated_at timestamptz;
alter table housing_houses add column if not exists eliminated_by bigint references users(id) on delete set null;
