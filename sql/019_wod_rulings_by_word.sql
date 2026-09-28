-- FILE: schema-wod-rulings-by-word.sql
-- Key dispute-poll verdicts by WORD, not by stem. Safe to run more than once.
--
-- Two different questions were sharing one key, and they shouldn't:
--
--   "has this been said before?"  -- a property of the word FAMILY. Stem-keyed,
--                                    so chauvinistic collides with chauvinist.
--   "is this word allowable?"     -- a property of the WORD ITSELF.
--
-- Keying rulings by stem meant a downvote spread across the whole family. Voting
-- `swashbuckle` down blacklisted stem `swashbuckl` and took `swashbuckler` -- a
-- perfectly good word -- with it. Same for `marginalized` killing `margin`. The
-- general case: `nutcrack` being rejected must not make `nutcracker` invalid.
--
-- Dedup is untouched and still runs on the stem. Only the rulings move.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'wod_word_rulings' and column_name = 'stem'
    ) then
        alter table wod_word_rulings rename column stem to word;
    end if;
end $$;
