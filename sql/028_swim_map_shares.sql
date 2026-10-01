-- FILE: schema-swim-map-shares.sql
-- Share your whole map with someone. They get a <YourName>Soup view on /meSoup
-- with every one of your spots in full; removing them takes it away again.
-- Safe to run more than once.
--
-- A grant, not a request: it gives the viewer something and asks nothing of
-- them, so unlike a tag there is nothing for them to accept.

create table if not exists swim_map_shares (
    owner_id   bigint not null references users(id) on delete cascade,
    viewer_id  bigint not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (owner_id, viewer_id),
    check (owner_id <> viewer_id)
);

-- "Whose maps can I see?" is asked on every signed-in page load.
create index if not exists swim_map_shares_viewer_idx on swim_map_shares (viewer_id);
