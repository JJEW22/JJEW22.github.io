-- FILE: schema-roles.sql
-- Per-account roles for admin privileges. Safe to run more than once.
-- Bootstrap your own account afterward, e.g.:
--   update users set roles = array['site:admin'] where username = 'yourname';
-- Grant only pickem admin to someone:
--   update users set roles = array['pickem:admin'] where username = 'friend';

alter table users add column if not exists roles text[] not null default '{}';