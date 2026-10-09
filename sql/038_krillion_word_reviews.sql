-- sql/038_krillion_word_reviews.sql
-- Words players asked to have accepted for Krillion, rescored: answers that
-- aren't on the day's sheet or in its counts. Safe to run more than once.
--
-- A player ticks "submit for review" next to the answer; it waits here as
-- pending until a krillion admin accepts or rejects it. An accepted word
-- scores its prompt's target mean + 1 target SD (see acceptedPoints in
-- $lib/krillion) for everyone who gave it that day. It lives here, not in
-- krillion_answers, because that table is replaced on every fetch.

create table if not exists krillion_word_reviews (
    id            bigint generated always as identity primary key,
    date          date not null,
    prompt_id     text not null,
    answer        text not null,                 -- as first submitted
    status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected')),
    user_id       bigint references users(id) on delete set null,   -- who first asked
    submission_id bigint references krillion_submissions(id) on delete set null,
    created_at    timestamptz not null default now(),
    decided_at    timestamptz,
    decided_by    bigint references users(id) on delete set null
);

-- One review per word per prompt per day, however many players ask.
create unique index if not exists krillion_word_reviews_word
    on krillion_word_reviews (date, prompt_id, lower(answer));
create index if not exists krillion_word_reviews_pending
    on krillion_word_reviews (created_at) where status = 'pending';
