-- FILE: schema-username-ci.sql
-- Case-insensitive username uniqueness. Usernames are stored as typed (for
-- display) but must be unique ignoring case, so "JJEW22" and "jjew22" can't
-- both exist. Safe to run once. (Assumes no existing case-variant collisions.)

create unique index if not exists users_username_lower_idx on users (lower(username));

-- One-time: restore your intended capitalization for the pre-existing account.
-- update users set username = 'JJEW22' where lower(username) = 'jjew22';