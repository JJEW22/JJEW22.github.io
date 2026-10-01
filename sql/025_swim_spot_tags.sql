-- FILE: schema-swim-spot-tags.sql
-- Tag the other people who were there. A tagged user sees the spot on their
-- own signed-in map; only the owner can edit it.
-- Safe to run more than once.
--
-- No limit on how many per spot. The owner is never tagged on their own spot --
-- the API drops them -- so "mine" and "shared with me" never overlap.

create table if not exists swim_spot_tags (
    spot_id    bigint not null references swim_spots(id) on delete cascade,
    user_id    bigint not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (spot_id, user_id)
);

-- "Spots I'm tagged in" is the signed-in map's second half.
create index if not exists swim_spot_tags_user_idx on swim_spot_tags (user_id);
