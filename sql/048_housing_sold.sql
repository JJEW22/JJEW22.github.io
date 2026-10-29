-- FILE: schema-housing-sold.sql
-- Marking a house on /housing as sold to someone else: like eliminating it, it
-- drops off the main list and the map and the weekly RentCast listing check
-- skips it, but it sits in its own "Sold" bucket with the price it went for.
-- A house is in one bucket at most; marking it sold clears an elimination.
-- Safe to run more than once.
alter table housing_houses add column if not exists sold_at timestamptz;
alter table housing_houses add column if not exists sold_by bigint references users(id) on delete set null;
alter table housing_houses add column if not exists sold_price numeric;
