-- sql/040_wod_open_polls.sql
-- The word-of-the-day bot's dispute polls and backup-word queues, in the
-- database rather than only in the bot's memory. Safe to run more than once.
--
-- A WRONG poll runs for six hours. It used to be an asyncio.sleep inside the
-- bot process, and the bot shares its container with the website -- so every
-- deploy (and any other restart) during those six hours killed the poll: it
-- never closed, no verdict was recorded, the word stayed rejected and its
-- author lost the day. Now each open poll is a row; on startup the bot
-- resumes them, closing any that came due while it was down.

create table if not exists wod_open_polls (
    poll_message_id     bigint primary key,      -- the bot's poll message
    disputed_message_id bigint not null,         -- the word on trial
    author_id           bigint not null,         -- whose word it is
    disputer_id         bigint not null,         -- who replied WRONG
    word                text not null,           -- as get_word_candidate read it
    opened_at           timestamptz not null,
    closes_at           timestamptz not null,
    queue_open          boolean not null default false  -- late enough to allow backup words
);

-- Backup words queued behind their author's open poll, judged in posting
-- order if the appeal fails.
create table if not exists wod_poll_queue (
    message_id bigint primary key,
    user_id    bigint not null,
    content    text not null,
    posted_at  timestamptz not null,   -- the word keeps ITS OWN day, however late it's judged
    stem       text not null,
    queued_at  timestamptz not null default now()
);
create index if not exists wod_poll_queue_user_idx on wod_poll_queue (user_id, posted_at);
