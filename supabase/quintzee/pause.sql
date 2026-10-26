CREATE OR REPLACE FUNCTION private.quintzee_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); m private.quintzee_matches; q jsonb; b jsonb; delta bigint;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'quintzee' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN
  UPDATE private.quintzee_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE
  SELECT * INTO m FROM private.quintzee_matches WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL FOR UPDATE;
  IF FOUND THEN
   delta:=at_ms-m.paused_at; q:=m.state->'core';b:=q->'board';
   b:=b||jsonb_build_object('deadline',(b->>'deadline')::bigint+delta);
   IF b ? 'startedAt' THEN b:=b||jsonb_build_object('startedAt',(b->>'startedAt')::bigint+delta);END IF;
   q:=jsonb_set(q,'{board}',b);
   UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(m.state,q),paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
