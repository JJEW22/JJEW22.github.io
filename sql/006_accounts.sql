-- FILE: schema-accounts.sql
-- Site-wide accounts (email) + email-bound invites.
-- email is added nullable+unique so it applies to the existing table without
-- failing on current rows. Once every account has an email (backfill or clear
-- test users), lock it down with the commented statement at the bottom.

alter table users   add column if not exists email text unique;
alter table invites add column if not exists email text;

-- After all real accounts have emails:
-- alter table users alter column email set not null;