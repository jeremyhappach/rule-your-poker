-- Let the existing fake-session cleanup owner remove Run21 fixtures atomically.
-- Match identities retain participant UUID evidence after a roster row departs.
ALTER TABLE private.run21_matches
  DROP CONSTRAINT run21_matches_dealer_game_id_fkey,
  ADD CONSTRAINT run21_matches_dealer_game_id_fkey FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  DROP CONSTRAINT run21_matches_game_id_fkey,
  ADD CONSTRAINT run21_matches_game_id_fkey FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
  DROP CONSTRAINT run21_matches_first_round_id_fkey,
  ADD CONSTRAINT run21_matches_first_round_id_fkey FOREIGN KEY(first_round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE private.run21_settlements
  DROP CONSTRAINT run21_settlements_dealer_game_id_fkey,
  ADD CONSTRAINT run21_settlements_dealer_game_id_fkey FOREIGN KEY(dealer_game_id) REFERENCES private.run21_matches(dealer_game_id) ON DELETE CASCADE,
  DROP CONSTRAINT run21_settlements_winner_id_fkey,
  DROP CONSTRAINT run21_settlements_loser_id_fkey;
