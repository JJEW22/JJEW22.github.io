-- FILE: schema-word-of-the-day.sql
-- Backing store for the Discord word-of-the-day bot (discord-wod-bot submodule).
-- Safe to run more than once.
--
-- The bot used to hold all of this in memory and rebuild it by replaying the whole
-- channel on every connect — which meant a network blip cost a full history scan,
-- and the dispute-poll verdicts (kept in two flat files) were lost on every restart
-- because they were opened with mode 'w+', which truncates.

-- One row per SUBMISSION ATTEMPT, not per winning word. Rejections are the whole
-- point of the stats we want later: "errors" and "streak" can't be derived from a
-- table that only remembers the words that were accepted.
create table if not exists wod_submissions (
    -- Discord's own message id. Being the primary key is what makes the backfill
    -- idempotent: re-running it over the channel can only overwrite a row, never
    -- duplicate one.
    message_id  bigint primary key,
    user_id     bigint not null,
    raw_message text not null,          -- as posted, e.g. 'chauvinistic (showing bias)'
    word        text,                   -- the candidate, lowercased; null if never a submission
    stem        text,                   -- Snowball stem — the key words collide on
    posted_at   timestamptz not null,   -- message timestamp; the one-per-day rule reads this in ET
    -- accepted     — counted, reacted to
    -- recycled     — the stem was already taken
    -- duplicate_day— that person had already posted that day
    -- invalid      — not a real word, or blacklisted
    status      text not null,
    recycled_of bigint,                 -- message_id it repeated, when status = 'recycled'
    created_at  timestamptz not null default now(),
    constraint wod_submissions_status_ck
        check (status in ('accepted', 'recycled', 'duplicate_day', 'invalid'))
);

-- A stem can be claimed by exactly one accepted word. Enforced here rather than
-- trusted to the bot, so a double-post race can't put two winners on one stem.
create unique index if not exists wod_submissions_stem_uq
    on wod_submissions (stem) where status = 'accepted';

-- Per-user history, for the stats page and the one-per-day check.
create index if not exists wod_submissions_user_idx on wod_submissions (user_id, posted_at desc);

-- Outcomes of the `WRONG` dispute polls. Replaces BOTH flat files: a stem can only
-- be whitelisted or blacklisted, never both, so one table with a verdict says it
-- more precisely than two lists that could disagree.
create table if not exists wod_word_rulings (
    stem            text primary key,
    verdict         text not null,      -- 'valid' = whitelisted, 'invalid' = blacklisted
    poll_message_id bigint,
    yes_count       int,
    no_count        int,
    decided_at      timestamptz not null default now(),
    constraint wod_word_rulings_verdict_ck check (verdict in ('valid', 'invalid'))
);
