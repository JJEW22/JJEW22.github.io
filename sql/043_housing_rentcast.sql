-- FILE: schema-housing-rentcast.sql
-- RentCast lookups for the houses on /housing. Safe to run more than once.
--
-- What RentCast returned is kept as-is (normalized, see RentcastDetails in
-- $lib/housing) next to the house's own columns, rather than written over
-- them: price, beds, baths and sqft stay what an admin typed or accepted, and
-- the lookup is shown beside them for comparison.
alter table housing_houses add column if not exists rentcast jsonb;

-- Each lookup is logged in housing_syncs as source 'rentcast' with the number
-- of API requests it spent, so the page can show how much of the month's free
-- allowance (50 requests) is left.
alter table housing_syncs add column if not exists calls int not null default 0;
