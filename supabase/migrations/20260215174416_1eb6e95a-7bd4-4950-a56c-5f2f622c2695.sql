-- Add foreign key from player_cards.player_id to players.id
-- ON DELETE CASCADE: only triggered during full game teardown (safe because mid-session uses soft-delete)
ALTER TABLE public.player_cards
ADD CONSTRAINT player_cards_player_id_fkey
FOREIGN KEY (player_id) REFERENCES public.players(id)
ON DELETE CASCADE;