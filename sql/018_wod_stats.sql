-- FILE: schema-wod-stats.sql
-- Stats for the word-of-the-day bot: server-wide totals, a leaderboard, and a
-- per-person sheet. Safe to run more than once.
--
-- The logic lives in VIEWS rather than in code because two things read it -- the
-- Python bot's slash commands and the SvelteKit site -- and writing the same
-- streak arithmetic in both languages would guarantee they eventually disagree.
-- Both consumers now just SELECT, so identical numbers are structural.
--
-- THREE KINDS OF STREAK, which differ in what breaks them:
--
--   day_streak        consecutive days with an accepted word. A quiet day ends it;
--                     a mistake does not.
--   clean_run         consecutive ACCEPTED SUBMISSIONS with no error between them.
--                     Counted in submissions, so gaps in days are irrelevant.
--   clean_day_streak  consecutive days that were both productive AND errorless.
--                     The strict one, and the leaderboard's sort key.
--
-- The third is not the minimum of the other two: landing a word and also getting
-- something rejected on the same day keeps day_streak alive but ends
-- clean_day_streak, which is exactly the distinction worth rewarding.
--
-- COLLISIONS are derived, not counted into a column. wod_submissions.recycled_of
-- already records which message each repeat stole from, so a stored tally would be
-- a second copy of the same fact, free to drift. Self-recycles are separated out
-- because a fifth of all repeats are people stealing their own word back.
--
-- Views are dropped and recreated rather than CREATE OR REPLACE'd, because
-- replacing a view fails as soon as its column list changes.

-- Display names, so the website can show people instead of snowflakes. The bot is
-- the only thing that can resolve a Discord id to a name, so it writes here and
-- the site reads. Nothing outside Discord can populate this.
create table if not exists wod_users (
    user_id      bigint primary key,
    display_name text not null,
    updated_at   timestamptz not null default now()
);

-- How big the playable space is. One row, refreshed by
-- discord-wod-bot/src/count_dictionary.py, which reads the hunspell files the bot
-- actually validates against and stems every entry.
--
-- total_stems is the meaningful denominator, not total_words: claiming
-- `chauvinist` also consumes `chauvinistic`, so the number of distinct PLAYS
-- available is the number of distinct stems.
--
-- Stored rather than derived because stemming 124k words takes seconds, which is
-- far too slow to do on every /leaderboard.
create table if not exists wod_dictionary (
    -- Single-row table: the check keeps it that way.
    id          smallint primary key default 1 check (id = 1),
    total_words int not null,
    total_stems int not null,
    computed_at timestamptz not null default now()
);

drop view if exists wod_leaderboard cascade;
drop view if exists wod_server_stats cascade;
drop view if exists wod_user_stats cascade;
drop view if exists wod_user_collisions cascade;
drop view if exists wod_plagiarist_pairs cascade;
drop view if exists wod_word_collisions cascade;
drop view if exists wod_clean_day_streaks cascade;
drop view if exists wod_day_streaks cascade;
drop view if exists wod_clean_runs cascade;
drop view if exists wod_user_days cascade;
drop view if exists wod_accepted_days cascade;

-- One row per person per day they posted anything, split into hits and misses.
-- Eastern, because that is the day boundary the one-word-per-day rule already uses.
create view wod_user_days as
select user_id,
       (posted_at at time zone 'America/New_York')::date         as day,
       count(*) filter (where status = 'accepted')::int          as accepted,
       count(*) filter (where status <> 'accepted')::int         as errors
from wod_submissions
group by 1, 2;

-- ---------- streak 1: days in a row with an accepted word ----------

-- Gaps and islands: for consecutive dates, (day - row_number()) is constant, so it
-- labels each unbroken run. Grouping on that label turns a list of days into runs.
create view wod_day_streaks as
with grouped as (
    select user_id, day,
           day - (row_number() over (partition by user_id order by day))::int as island
    from wod_user_days where accepted > 0
),
runs as (
    select user_id, island, count(*)::int as length,
           min(day) as started, max(day) as ended
    from grouped group by 1, 2
)
select user_id,
       max(length)::int as longest_day_streak,
       -- Still "current" while its last day is today OR yesterday: a streak
       -- shouldn't look broken just because nobody has posted yet this morning.
       coalesce(max(length) filter (
           where ended >= (now() at time zone 'America/New_York')::date - 1
       ), 0)::int as current_day_streak,
       -- Total days they landed a word, and the first of them. Summed across runs
       -- rather than taken from the accepted COUNT: the two are equal today only
       -- because of the one-word-per-day rule, and this stays right regardless.
       sum(length)::int as accepted_days,
       min(started)     as first_accepted_day
from runs group by user_id;

-- ---------- streak 2: accepted submissions in a row, no error between ----------

create view wod_clean_runs as
with seq as (
    -- A running count of errors labels each clean run: every accepted submission
    -- between error k and error k+1 carries the same value.
    select user_id, status,
           sum(case when status <> 'accepted' then 1 else 0 end) over (
               partition by user_id order by posted_at, message_id
               rows between unbounded preceding and current row
           ) as errors_before
    from wod_submissions
),
runs as (
    select user_id, errors_before, count(*)::int as length
    from seq where status = 'accepted' group by 1, 2
),
totals as (
    select user_id, count(*) filter (where status <> 'accepted')::int as total_errors
    from wod_submissions group by 1
)
select t.user_id,
       coalesce(max(r.length), 0)::int as longest_clean_run,
       -- The run still open is the one carrying the person's TOTAL error count --
       -- nothing has gone wrong since. If their last submission was an error, no
       -- run has that label and the current run is correctly zero.
       coalesce(max(r.length) filter (where r.errors_before = t.total_errors), 0)::int
           as current_clean_run
from totals t left join runs r on r.user_id = t.user_id
group by t.user_id;

-- ---------- streak 3 (main): errorless days in a row ----------

create view wod_clean_day_streaks as
with grouped as (
    select user_id, day,
           day - (row_number() over (partition by user_id order by day))::int as island
    from wod_user_days where accepted > 0 and errors = 0
),
runs as (
    select user_id, island, count(*)::int as length, max(day) as ended
    from grouped group by 1, 2
)
select user_id,
       max(length)::int as longest_clean_day_streak,
       coalesce(max(length) filter (
           where ended >= (now() at time zone 'America/New_York')::date - 1
       ), 0)::int as current_clean_day_streak
from runs group by user_id;

-- ---------- collisions ----------

-- Every accepted word with how contested it is. LEFT JOIN so words nobody has
-- tried to steal appear with zeroes rather than dropping out.
create view wod_word_collisions as
select o.message_id,
       o.word,
       o.stem,
       o.user_id                                                        as owner_user_id,
       u.display_name                                                   as owner_name,
       o.posted_at                                                      as claimed_at,
       count(r.message_id)::int                                         as times_recycled,
       count(r.message_id) filter (where r.user_id <> o.user_id)::int    as times_stolen,
       count(r.message_id) filter (where r.user_id = o.user_id)::int     as times_self_recycled,
       count(distinct r.user_id) filter (where r.user_id <> o.user_id)::int as distinct_thieves
from wod_submissions o
left join wod_submissions r
       on r.recycled_of = o.message_id and r.status = 'recycled'
left join wod_users u on u.user_id = o.user_id
where o.status = 'accepted'
group by o.message_id, o.word, o.stem, o.user_id, u.display_name, o.posted_at;

-- Who steals from whom. Useful on its own ("your nemesis") and the basis for the
-- distinct-thieves count below.
create view wod_plagiarist_pairs as
select o.user_id as victim_id,
       r.user_id as thief_id,
       count(*)::int as times
from wod_submissions r
join wod_submissions o on o.message_id = r.recycled_of
where r.status = 'recycled'
group by 1, 2;

create view wod_user_collisions as
with ranked as (
    select owner_user_id, word, times_recycled, times_stolen, times_self_recycled,
           row_number() over (
               partition by owner_user_id
               order by times_stolen desc, times_recycled desc, word
           ) as rn
    from wod_word_collisions
),
agg as (
    select owner_user_id as user_id,
           sum(times_recycled)::int      as times_words_recycled,
           sum(times_stolen)::int        as times_plagiarised,
           sum(times_self_recycled)::int as self_recycles,
           max(word) filter (where rn = 1)         as most_contested_word,
           max(times_stolen) filter (where rn = 1) as most_contested_count
    from ranked group by owner_user_id
),
thieves as (
    select victim_id as user_id, count(*)::int as distinct_thieves
    from wod_plagiarist_pairs
    where thief_id <> victim_id
    group by 1
)
select a.*, coalesce(t.distinct_thieves, 0) as distinct_thieves
from agg a left join thieves t on t.user_id = a.user_id;

-- ---------- per person ----------

create view wod_user_stats as
select s.user_id,
       u.display_name,
       count(*)::int                                            as submitted,
       count(*) filter (where s.status = 'accepted')::int        as accepted,
       count(*) filter (where s.status = 'recycled')::int        as recycled,
       count(*) filter (where s.status = 'duplicate_day')::int   as duplicate_day,
       count(*) filter (where s.status = 'invalid')::int         as invalid,
       -- Share of attempts that stuck. Rounded here so both consumers show the
       -- same figure rather than rounding it two different ways.
       round(count(*) filter (where s.status = 'accepted')::numeric
             / greatest(count(*), 1) * 100, 1)                   as accuracy_pct,
       coalesce(cd.current_clean_day_streak, 0)                  as current_clean_day_streak,
       coalesce(cd.longest_clean_day_streak, 0)                  as longest_clean_day_streak,
       coalesce(d.current_day_streak, 0)                         as current_day_streak,
       coalesce(d.longest_day_streak, 0)                         as longest_day_streak,
       coalesce(cr.current_clean_run, 0)                         as current_clean_run,
       coalesce(cr.longest_clean_run, 0)                         as longest_clean_run,
       -- Collisions, from both sides of the crime.
       coalesce(co.times_plagiarised, 0)                         as times_plagiarised,
       coalesce(co.self_recycles, 0)                             as self_recycles,
       coalesce(co.distinct_thieves, 0)                          as distinct_thieves,
       co.most_contested_word,
       coalesce(co.most_contested_count, 0)                      as most_contested_count,
       -- Turnout: days with a word, over every day since their first one.
       -- Measured to TODAY, not to their last word, so it decays for someone who
       -- has stopped playing -- which is what "% of days since joining" means.
       coalesce(d.accepted_days, 0)                              as accepted_days,
       coalesce(
           ((now() at time zone 'America/New_York')::date - d.first_accepted_day) + 1, 0
       )                                                         as days_since_first,
       case when d.first_accepted_day is null then 0
            else round(d.accepted_days::numeric / greatest(
                     ((now() at time zone 'America/New_York')::date - d.first_accepted_day) + 1, 1
                 ) * 100, 1)
       end                                                       as submission_rate_pct,
       min(s.posted_at)                                          as first_at,
       max(s.posted_at)                                          as last_at
from wod_submissions s
left join wod_clean_day_streaks cd on cd.user_id = s.user_id
left join wod_day_streaks       d  on d.user_id  = s.user_id
left join wod_clean_runs        cr on cr.user_id = s.user_id
left join wod_user_collisions   co on co.user_id = s.user_id
left join wod_users             u  on u.user_id  = s.user_id
group by s.user_id, u.display_name,
         cd.current_clean_day_streak, cd.longest_clean_day_streak,
         d.current_day_streak, d.longest_day_streak,
         cr.current_clean_run, cr.longest_clean_run,
         co.times_plagiarised, co.self_recycles, co.distinct_thieves,
         co.most_contested_word, co.most_contested_count,
         d.accepted_days, d.first_accepted_day;

-- ---------- the ranking ----------

-- Lives here so the bot and the site cannot disagree about who is top. The chain:
--
--   1. current clean-day streak  -- the strict one
--   2. current day streak + current clean run  -- the other two, summed
--   3. accepted words            -- lifetime volume
--   4. user_id ascending         -- oldest account wins, so the order is stable
--
-- The last rung matters: without it Postgres is free to return tied rows in any
-- order, and the leaderboard would reshuffle between reads.
create view wod_leaderboard as
select row_number() over (
           order by current_clean_day_streak desc,
                    (current_day_streak + current_clean_run) desc,
                    accepted desc,
                    user_id
       )::int as rank,
       (current_day_streak + current_clean_run)::int as tiebreak_sum,
       *
from wod_user_stats;

-- ---------- the whole channel ----------

create view wod_server_stats as
-- A CTE rather than a wall of scalar subqueries, so the derived figures (errors,
-- accuracy, turnout) can be built from the raw counts instead of repeating them.
with base as (
    select count(*)::int                                            as submitted,
           count(*) filter (where status = 'accepted')::int          as accepted,
           count(*) filter (where status = 'recycled')::int          as recycled,
           count(*) filter (where status = 'duplicate_day')::int     as duplicate_day,
           count(*) filter (where status = 'invalid')::int           as invalid,
           count(distinct user_id)::int                              as participants,
           -- Accepted words that came OUT of the dictionary, i.e. consumed one of
           -- its stems.
           count(*) filter (where status = 'accepted' and from_dictionary)::int
                                                                     as accepted_from_dictionary,
           -- Accepted words the dictionary didn't have, let in by a dispute poll.
           -- Each one GROWS the vocabulary as well as claiming a word from it, so
           -- it goes on both sides of the fraction below. Null from_dictionary
           -- (not yet backfilled) counts as neither -- unknown, not zero.
           count(*) filter (where status = 'accepted' and from_dictionary = false)::int
                                                                     as accepted_by_poll,
           min(posted_at)                                            as first_at,
           max(posted_at)                                            as last_at,
           -- Measured to TODAY, not to the last word: a channel that has gone
           -- quiet has still been running, and its turnout should reflect that.
           (((now() at time zone 'America/New_York')::date
             - min((posted_at at time zone 'America/New_York')::date)) + 1)::int as days_running
    from wod_submissions
),
days as (
    select count(distinct day)::int as active_days
    from wod_user_days where accepted > 0
)
select b.submitted,
       b.accepted,
       b.recycled,
       b.duplicate_day,
       b.invalid,
       b.participants,
       b.first_at,
       b.last_at,
       b.days_running,
       d.active_days,
       -- Everything that wasn't accepted. Note this includes duplicate_day, so the
       -- sub-categories only sum to it if that one is shown alongside them.
       (b.submitted - b.accepted)                                    as errors,
       round(b.accepted::numeric / greatest(b.submitted, 1) * 100, 1) as accuracy_pct,
       round(d.active_days::numeric / greatest(b.days_running, 1) * 100, 1) as pct_days_with_word,
       (select count(*) from wod_word_rulings)::int                  as rulings,
       -- How much of the vocabulary is gone. Null until count_dictionary.py has
       -- run, which the formatter treats as "unknown" rather than showing a wrong
       -- zero.
       --
       -- The vocabulary is the dictionary's stems PLUS every word a poll let in:
       -- a poll word is claimed (numerator) and also enlarges the pool it was
       -- claimed from (denominator). Leaving it out of both would undercount the
       -- words played; counting it only on top would let polls push past 100%.
       -- words_remaining is unaffected either way -- a poll word adds one to each
       -- side -- so it still equals stems minus dictionary words claimed.
       (select total_words from wod_dictionary where id = 1)          as dictionary_words,
       (select total_stems from wod_dictionary where id = 1)          as dictionary_stems,
       b.accepted_from_dictionary,
       b.accepted_by_poll,
       ((select total_stems from wod_dictionary where id = 1) + b.accepted_by_poll)
                                                                     as vocab_size,
       (b.accepted_from_dictionary + b.accepted_by_poll)             as vocab_claimed,
       round((b.accepted_from_dictionary + b.accepted_by_poll)::numeric
             / greatest((select total_stems from wod_dictionary where id = 1) + b.accepted_by_poll, 1)
             * 100, 2)                                               as pct_dictionary_used,
       ((select total_stems from wod_dictionary where id = 1) + b.accepted_by_poll
        - (b.accepted_from_dictionary + b.accepted_by_poll))         as words_remaining,

    -- Current leader, by the leaderboard's own ordering.
    (select user_id      from wod_leaderboard where rank = 1)                  as leader_user_id,
    (select display_name from wod_leaderboard where rank = 1)                  as leader_name,
    (select current_clean_day_streak from wod_leaderboard where rank = 1)      as leader_clean_day_streak,

    -- All-time record for each of the three streaks, with its holder.
    (select user_id      from wod_user_stats order by longest_clean_day_streak desc, accepted desc, user_id limit 1) as record_clean_day_user_id,
    (select display_name from wod_user_stats order by longest_clean_day_streak desc, accepted desc, user_id limit 1) as record_clean_day_name,
    (select longest_clean_day_streak from wod_user_stats order by longest_clean_day_streak desc, accepted desc, user_id limit 1) as record_clean_day_streak,
    (select user_id      from wod_user_stats order by longest_day_streak desc, accepted desc, user_id limit 1) as record_day_user_id,
    (select display_name from wod_user_stats order by longest_day_streak desc, accepted desc, user_id limit 1) as record_day_name,
    (select longest_day_streak from wod_user_stats order by longest_day_streak desc, accepted desc, user_id limit 1) as record_day_streak,
    (select user_id      from wod_user_stats order by longest_clean_run desc, accepted desc, user_id limit 1) as record_clean_run_user_id,
    (select display_name from wod_user_stats order by longest_clean_run desc, accepted desc, user_id limit 1) as record_clean_run_name,
    (select longest_clean_run from wod_user_stats order by longest_clean_run desc, accepted desc, user_id limit 1) as record_clean_run,

    -- Collisions across the channel. thefts = you took someone else's word;
    -- self_recycles = you took your own back. They sum to `recycled`.
    (select sum(times_stolen) from wod_word_collisions)::int                   as total_thefts,
    (select sum(times_self_recycled) from wod_word_collisions)::int            as total_self_recycles,
    (select word          from wod_word_collisions order by times_recycled desc, word limit 1) as most_contested_word,
    (select times_recycled from wod_word_collisions order by times_recycled desc, word limit 1) as most_contested_count,
    (select owner_user_id from wod_word_collisions order by times_recycled desc, word limit 1) as most_contested_owner_id,
    (select owner_name    from wod_word_collisions order by times_recycled desc, word limit 1) as most_contested_owner_name
from base b cross join days d;
