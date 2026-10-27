-- FILE: schema-housing.sql
-- Housing market data for /housing, pulled from FRED and Zillow Research.
-- Safe to run more than once.
--
-- One row per series, with its observations as a jsonb array of
-- ["YYYY-MM-DD", value] pairs rather than one row per observation. Every read
-- wants a whole series (a chart, a year-over-year change), never a slice across
-- series, and a refresh replaces a series wholesale. Zillow's metro files are
-- ~900 regions x ~320 months each; as rows that is a few hundred thousand
-- inserts per refresh, as jsonb it is ~1,600 upserts.
--
-- Grant access to someone (site:admin already has it):
--   update users set roles = array_append(roles, 'housing:admin') where username = 'friend';

create table if not exists housing_series (
    id          bigint generated always as identity primary key,
    source      text not null check (source in ('fred', 'zillow')),
    -- FRED series id ('MORTGAGE30US'), or the Zillow dataset ('zhvi', 'zori').
    key         text not null,
    -- Zillow's RegionID. Empty for FRED, whose series are national, so the
    -- unique index below doesn't have to special-case nulls.
    region_id   text not null default '',
    region_name text,
    region_type text,                    -- 'country' | 'msa'
    state_name  text,
    size_rank   int,                     -- Zillow's: 0 is the US, 1 is New York
    points      jsonb not null,
    fetched_at  timestamptz not null default now(),
    unique (source, key, region_id)
);

create index if not exists housing_series_regions_idx
    on housing_series (source, key, size_rank);

-- One row per refresh attempt per source, so the page can say when the data
-- was last pulled and why the last attempt failed, if it did.
create table if not exists housing_syncs (
    id          bigint generated always as identity primary key,
    source      text not null,
    ok          boolean not null,
    detail      text not null,
    ran_at      timestamptz not null default now()
);

create index if not exists housing_syncs_recent_idx on housing_syncs (source, ran_at desc);
