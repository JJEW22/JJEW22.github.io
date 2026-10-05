-- FILE: schema-account-names.sql
-- A person's name on their account, separate from their username.
-- Safe to run more than once.
--
-- The username is the login and the screen name (what PL Pickem shows). The
-- real name is who you are: "Vedant & Dina", not "vdina22". Snow Predictions
-- shows it on every prediction linked to the account, and keeps those entries'
-- display_name in step with it whenever it changes. The owner can set it, and
-- a snow admin can override anyone's.

alter table users add column if not exists real_name text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'users_real_name_len') then
        alter table users
            add constraint users_real_name_len
            check (real_name is null or char_length(real_name) between 1 and 60);
    end if;
end $$;
