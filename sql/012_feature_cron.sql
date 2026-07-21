-- FILE: schema-features-cron.sql
-- Feature requests (one per participant per 2-week cycle) + a small key/value
-- table the cron uses to remember what it has already done. Safe to re-run.
create table if not exists feature_requests (
    id         bigint generated always as identity primary key,
    user_id    bigint not null references users(id) on delete cascade,
    cycle      int not null,               -- index of the 2-week window
    body       text not null,
    created_at timestamptz not null default now(),
    unique (user_id, cycle)                -- one submission per person per cycle
);

create table if not exists app_meta (
    key        text primary key,
    value      text,
    updated_at timestamptz not null default now()
);