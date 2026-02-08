CREATE OR REPLACE FUNCTION public.record_session_results()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  player_total RECORD;
  game_name TEXT;
BEGIN
  -- Only trigger when status changes to 'completed' or 'session_ended' and it's a real money game
  IF (NEW.status = 'completed' OR NEW.status = 'session_ended')
     AND OLD.status IS DISTINCT FROM 'completed'
     AND OLD.status IS DISTINCT FROM 'session_ended'
     AND NEW.real_money = true THEN
    
    -- Get the game name
    game_name := COALESCE(NEW.name, 'Unnamed Session');
    
    -- Insert a transaction for each player with the SUM of all their snapshots
    -- Each snapshot represents one game's chip change, so we need to sum them all
    FOR player_total IN 
      SELECT user_id, SUM(chips) as total_chips
      FROM public.session_player_snapshots
      WHERE game_id = NEW.id AND is_bot = false
      GROUP BY user_id
    LOOP
      -- Only insert for non-bot players (user_id should be a real profile)
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = player_total.user_id) THEN
        INSERT INTO public.player_transactions (profile_id, transaction_type, amount, notes)
        VALUES (player_total.user_id, 'SessionResult', player_total.total_chips, game_name);
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;