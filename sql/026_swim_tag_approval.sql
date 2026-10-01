-- FILE: schema-swim-tag-approval.sql
-- Being tagged in someone's swim is a request, not a fact. The tagged person
-- sees it at the top of /meSoup the next time they're signed in and accepts or
-- declines; only accepted tags put the spot on their map or their name on it.
-- Safe to run more than once.
--
-- A declined tag is kept, not deleted, so re-saving the spot doesn't ask again.
-- The owner re-asks by removing the name and adding it back.

alter table swim_spot_tags
    add column if not exists status text not null default 'pending',
    add column if not exists responded_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'swim_spot_tags_status_check'
    ) then
        alter table swim_spot_tags
            add constraint swim_spot_tags_status_check
            check (status in ('pending', 'accepted', 'declined'));
    end if;
end $$;

-- The banner's query: "anything waiting on me?"
create index if not exists swim_spot_tags_pending_idx
    on swim_spot_tags (user_id) where status = 'pending';
