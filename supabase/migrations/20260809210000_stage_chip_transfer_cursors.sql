-- Realtime can deliver balance rows before gameplay_transfer_batches.  Stage
-- the next per-game cursor in the balance row itself so the client ledger
-- keeps presentation ownership until the corresponding immutable batch exists.

CREATE OR REPLACE FUNCTION public.stage_gameplay_player_transfer_cursor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cursor bigint;
BEGIN
  IF NEW.chips IS NOT DISTINCT FROM OLD.chips THEN
    RETURN NEW;
  END IF;
  SELECT chip_transfer_cursor + 1 INTO v_cursor
    FROM public.games
   WHERE id = NEW.game_id
   FOR UPDATE;
  IF v_cursor IS NULL THEN
    RAISE EXCEPTION 'gameplay_transfer_cursor:game_not_found:%', NEW.game_id;
  END IF;
  NEW.chip_transfer_cursor := v_cursor;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_gameplay_pot_transfer_cursor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.pot, 0) IS DISTINCT FROM COALESCE(OLD.pot, 0) THEN
    NEW.pot_transfer_cursor := OLD.chip_transfer_cursor + 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gameplay_transfer_players_stage_cursor ON public.players;
CREATE TRIGGER gameplay_transfer_players_stage_cursor
  BEFORE UPDATE OF chips ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.stage_gameplay_player_transfer_cursor();

DROP TRIGGER IF EXISTS gameplay_transfer_games_stage_pot_cursor ON public.games;
CREATE TRIGGER gameplay_transfer_games_stage_pot_cursor
  BEFORE UPDATE OF pot ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.stage_gameplay_pot_transfer_cursor();

-- Preserve the long-standing public helper semantics while taking the session
-- lock before a chip row changes.  That gives every writer the same
-- game->player ordering as the canonical transfer RPC and makes the staged
-- cursor unique under concurrent transfers.
CREATE OR REPLACE FUNCTION public.decrement_player_chips(player_ids uuid[], amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_game_id uuid;
BEGIN
  FOR v_game_id IN
    SELECT DISTINCT game_id
      FROM public.players
     WHERE id = ANY(player_ids)
     ORDER BY game_id
  LOOP
    PERFORM 1 FROM public.games WHERE id = v_game_id FOR UPDATE;
  END LOOP;

  UPDATE public.players
     SET chips = chips - amount
   WHERE id = ANY(player_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_player_chips(p_player_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_game_id uuid;
  new_chips integer;
BEGIN
  SELECT game_id INTO v_game_id FROM public.players WHERE id = p_player_id;
  IF v_game_id IS NOT NULL THEN
    PERFORM 1 FROM public.games WHERE id = v_game_id FOR UPDATE;
  END IF;

  UPDATE public.players
     SET chips = chips + p_amount
   WHERE id = p_player_id
   RETURNING chips INTO new_chips;
  RETURN new_chips;
END;
$function$;
