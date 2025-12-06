-- Drop the TEMP testing policy that may be causing confusion
DROP POLICY IF EXISTS "TEMP: Players can view all cards for testing" ON public.player_cards;