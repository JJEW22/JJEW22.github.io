-- FILE: schema-swim-owners-and-types.sql
-- Give every swim spot an owner, and keep the water types people type in under
-- "Other" on /meSoup/admin.
-- Safe to run more than once.

-- --- owners ---
--
-- Anyone signed in can keep their own map; /meSoup shows JJEW22's unless a
-- ?user= says otherwise. Every spot before this migration was JJEW22's.

alter table swim_spots
    add column if not exists user_id bigint references users(id) on delete cascade;

update swim_spots
set user_id = (select id from users where lower(username) = 'jjew22')
where user_id is null;

-- Only once nothing is left unowned -- if the account above didn't exist, the
-- update did nothing and this would fail the whole file.
do $$
begin
    if not exists (select 1 from swim_spots where user_id is null) then
        alter table swim_spots alter column user_id set not null;
    end if;
end $$;

create index if not exists swim_spots_user_idx on swim_spots (user_id, swum_on desc nulls last);

-- --- custom water types ---
--
-- Only the ADDITIONS live here. The built-in types (ocean, lake, pool, ...) stay
-- in $lib/swimSpots, which merges these in after them; copying the built-ins in
-- here too would give the list two owners.
--
-- Per user, so one person's categories don't land in everyone's dropdown. A
-- type outlives the spots that use it on purpose: deleting the last hot spring
-- shouldn't take "Hot spring" out of the list.

create table if not exists swim_water_types (
    user_id    bigint not null references users(id) on delete cascade,
    id         text not null,             -- waterTypeId(label): 'hot-spring'
    label      text not null,             -- as first typed: 'Hot spring'
    color      text not null,             -- from CUSTOM_TYPE_COLORS
    created_at timestamptz not null default now(),
    primary key (user_id, id)
);
