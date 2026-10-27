-- FILE: schema-housing-houses.sql
-- Houses under consideration on /housing, shared by every housing admin.
-- Safe to run more than once.
--
-- The listing details (price, beds, ...) are typed in, not fetched: Zillow
-- blocks automated requests to its listing pages and its terms forbid
-- scraping. The address and zpid come from the link itself.

create table if not exists housing_houses (
    id          bigint generated always as identity primary key,
    url         text not null,
    zpid        text,                    -- from the link, when it has one
    address     text,                    -- from the link, editable
    price       numeric(12, 2),
    beds        numeric(4, 1),
    baths       numeric(4, 1),
    sqft        int,
    notes       text not null default '',
    -- The cost-analysis inputs last saved for this house. Null means the page
    -- defaults (today's mortgage rate, etc.), which move as the market does.
    assumptions jsonb,
    added_by    bigint references users(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- One row per listing. The zpid is the listing's identity; two links to the
-- same home differ only in tracking parameters.
create unique index if not exists housing_houses_zpid on housing_houses (zpid) where zpid is not null;
