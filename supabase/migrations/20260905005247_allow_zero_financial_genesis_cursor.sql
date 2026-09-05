CREATE OR REPLACE FUNCTION private.guard_browser_player_finances()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF (TG_OP='INSERT' AND (NEW.chips<>0 OR NEW.legs<>0 OR coalesce(NEW.chip_transfer_cursor,0)<>0))
     OR (TG_OP='UPDATE' AND (OLD.chips IS DISTINCT FROM NEW.chips OR OLD.legs IS DISTINCT FROM NEW.legs
       OR OLD.chip_transfer_cursor IS DISTINCT FROM NEW.chip_transfer_cursor)) THEN
   RAISE EXCEPTION 'player_finances:authoritative_command_required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_browser_game_finances()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF (TG_OP='INSERT' AND (coalesce(NEW.pot,0)<>0 OR coalesce(NEW.chip_transfer_cursor,0)<>0))
     OR (TG_OP='UPDATE' AND (OLD.pot IS DISTINCT FROM NEW.pot
       OR OLD.chip_transfer_cursor IS DISTINCT FROM NEW.chip_transfer_cursor)) THEN
   RAISE EXCEPTION 'game_finances:authoritative_command_required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
