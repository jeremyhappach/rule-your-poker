
-- Drop cascading FK on player_cards.player_id to prevent history loss when players rejoin
ALTER TABLE public.player_cards DROP CONSTRAINT player_cards_player_id_fkey;

-- Drop cascading FK on player_actions.player_id to prevent history loss when players rejoin  
ALTER TABLE public.player_actions DROP CONSTRAINT player_actions_player_id_fkey;
