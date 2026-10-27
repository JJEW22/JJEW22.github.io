-- FILE: schema-housing-ratings-ten.sql
-- House ratings go from 1-5 to 1-10, and gain two independent toggles beside
-- the score: "wouldn't buy" and "wouldn't rent". Both on means neither.
-- Every rating has a score; the toggles are flags next to it, not part of it,
-- so the average stays an average of scores.
-- Safe to run more than once.

do $$
begin
    -- Only on the first run: the toggle columns not existing yet means the
    -- scores are still 1-5, so they're doubled onto the new scale (5 -> 10).
    if not exists (
        select 1 from information_schema.columns
        where table_name = 'housing_house_ratings' and column_name = 'wouldnt_buy'
    ) then
        alter table housing_house_ratings drop constraint if exists housing_house_ratings_score_check;
        update housing_house_ratings set score = score * 2;
        alter table housing_house_ratings add column wouldnt_buy boolean not null default false;
        alter table housing_house_ratings add column wouldnt_rent boolean not null default false;
    end if;
end $$;

alter table housing_house_ratings drop constraint if exists housing_house_ratings_score_check;
alter table housing_house_ratings
    add constraint housing_house_ratings_score_check check (score between 1 and 10);
