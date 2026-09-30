-- FILE: schema-jpflicks-publish.sql
-- Let a season be built before anyone can find it.
-- Safe to run more than once.
--
-- Publishing controls DISCOVERY, not access: an unpublished season is absent
-- from the season tabs for everyone but an admin, and is left out of the
-- default landing season, but it still answers on its own URL. That is the
-- point — a half-built Season 3 can be shared with whoever is helping set it
-- up without appearing on the league's front page.
--
-- It is deliberately NOT a permission. Who may enter and approve results still
-- turns on is_current and on which teams a person plays for; wiring those to
-- publication too would mean the league silently stopped accepting scores the
-- moment somebody unpublished it.

alter table jpflicks_seasons
    add column if not exists is_published boolean not null default false;

-- Seasons 1 and 2 were already on the public page before this column existed,
-- so unpublishing them here would be a regression rather than a default.
update jpflicks_seasons set is_published = true where slug in ('season-1', 'season-2');
