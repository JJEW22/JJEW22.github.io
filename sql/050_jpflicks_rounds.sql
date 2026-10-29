-- FILE: 050_jpflicks_rounds.sql
-- Season 3 scores every round, not just the game.
-- Safe to run more than once.
--
-- Seasons 1 and 2 only ever recorded a game's margin, and they are scored the
-- way they always were ('games'). From season 3 every game plays all 4 rounds
-- and each round counts, so a result also records the round-by-round scores
-- ('rounds'). New seasons default to the new format.
--
-- rounds is [[a, b], ...] from team_a's point of view, the same convention as
-- margin. margin is still stored, as the difference of the round totals, so
-- the matrices and the forfeit maths keep working unchanged. A forfeit has no
-- rounds.
--
-- A game cannot end level: a tie on points after 4 rounds goes to a 20s
-- shootout, and shootout_winner records who won it. The margin stays 0 -- the
-- shootout decides the game, not the point differential.

alter table jpflicks_seasons
    add column if not exists scoring text not null default 'rounds'
        check (scoring in ('games', 'rounds'));

update jpflicks_seasons set scoring = 'games' where season_number < 3 and scoring <> 'games';

alter table jpflicks_matches
    add column if not exists rounds jsonb;

alter table jpflicks_matches
    add column if not exists shootout_winner bigint references jpflicks_teams(id) on delete set null;
