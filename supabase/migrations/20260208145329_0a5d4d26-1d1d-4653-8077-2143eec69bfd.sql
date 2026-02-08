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

    game_name := COALESCE(NEW.name, 'Unnamed Session');

    -- SessionResult should reflect the FINAL snapshot per player (not a sum).
    -- Snapshots store the player's running chip balance across the session.
    FOR player_total IN
      SELECT DISTINCT ON (user_id)
        user_id,
        chips AS final_chips
      FROM public.session_player_snapshots
      WHERE game_id = NEW.id
        AND is_bot = false
      ORDER BY user_id, created_at DESC
    LOOP
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = player_total.user_id) THEN
        INSERT INTO public.player_transactions (profile_id, transaction_type, amount, notes)
        VALUES (player_total.user_id, 'SessionResult', player_total.final_chips, game_name);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;