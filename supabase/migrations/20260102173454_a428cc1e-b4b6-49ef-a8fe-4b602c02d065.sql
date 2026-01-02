CREATE OR REPLACE FUNCTION public.record_session_results()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  snapshot RECORD;
  game_name TEXT;
BEGIN
  -- Only trigger when status changes to 'completed' or 'session_ended' and it's a real money game
  IF (NEW.status = 'completed' OR NEW.status = 'session_ended')
     AND OLD.status IS DISTINCT FROM 'completed'
     AND OLD.status IS DISTINCT FROM 'session_ended'
     AND NEW.real_money = true THEN
    
    -- Get the game name
    game_name := COALESCE(NEW.name, 'Unnamed Session');
    
    -- Insert a transaction for each player snapshot from this session
    FOR snapshot IN 
      SELECT DISTINCT ON (user_id) user_id, chips, username
      FROM public.session_player_snapshots
      WHERE game_id = NEW.id
      ORDER BY user_id, created_at DESC
    LOOP
      -- Only insert for non-bot players (user_id should be a real profile)
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = snapshot.user_id) THEN
        INSERT INTO public.player_transactions (profile_id, transaction_type, amount, notes)
        VALUES (snapshot.user_id, 'SessionResult', snapshot.chips, game_name);
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;