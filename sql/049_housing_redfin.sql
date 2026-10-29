-- FILE: schema-housing-redfin.sql
-- Redfin as a third source for /housing: buyers and sellers ("Balance of
-- Power") for the US, the 50 biggest metros, and Greater Boston's estimate.
-- Its rows use key 'buyers' / 'sellers' and Redfin's region name as region_id
-- ('National', 'Boston, MA metro area'), or 'greater-boston'.
-- Safe to run more than once.
alter table housing_series drop constraint if exists housing_series_source_check;
alter table housing_series
    add constraint housing_series_source_check check (source in ('fred', 'zillow', 'redfin'));
