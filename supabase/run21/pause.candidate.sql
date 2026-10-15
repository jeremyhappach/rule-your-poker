-- Attach to the existing canonical pause owner; never create an independent pause API.
CREATE OR REPLACE FUNCTION private.run21_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.run21_matches; shifted jsonb; board jsonb; key text; id text; delta bigint;
 at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'run21' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW; END IF;
 SELECT * INTO m FROM private.run21_matches WHERE dealer_game_id=NEW.current_game_uuid AND financial_version=2 FOR UPDATE;
 IF NOT FOUND OR m.finished OR nullif(m.state->'settlement','null'::jsonb) IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.is_paused THEN
  UPDATE private.run21_matches SET paused_at=at_ms,
    state=CASE WHEN state IS NOT NULL THEN jsonb_set(state,'{pausedAt}',to_jsonb(at_ms)) ELSE state END,
    revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSE
  IF NEW.real_money AND EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=NEW.id AND p.sitting_out
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p.id::text)) THEN
    RAISE EXCEPTION 'run21:return_players_before_resume';
  END IF;
  IF m.paused_at IS NULL THEN RAISE EXCEPTION 'run21:missing_pause_identity'; END IF;
  delta:=greatest(0,at_ms-m.paused_at);shifted:=m.state;
  IF shifted IS NOT NULL THEN
   id:=shifted#>>'{rounds,-1,active_player_id}';
   IF id IS NOT NULL THEN
    board:=shifted#>ARRAY['rounds','-1','boards',id];
    FOREACH key IN ARRAY ARRAY['startedAt','deadline','firstPlacementDeadline'] LOOP
     IF board->>key IS NOT NULL THEN board:=jsonb_set(board,ARRAY[key],to_jsonb((board->>key)::bigint+delta)); END IF;
    END LOOP;
    shifted:=jsonb_set(shifted,ARRAY['rounds','-1','boards',id],board);
   END IF;
   FOREACH key IN ARRAY ARRAY['startedAt','endsAt'] LOOP
    IF shifted#>>ARRAY['rounds','-1','scorePresentation',key] IS NOT NULL THEN
     shifted:=jsonb_set(shifted,ARRAY['rounds','-1','scorePresentation',key],to_jsonb((shifted#>>ARRAY['rounds','-1','scorePresentation',key])::bigint+delta));
    END IF;
   END LOOP;
   shifted:=jsonb_set(jsonb_set(shifted,'{pausedAt}','null'),'{updatedAt}',to_jsonb(at_ms));
  END IF;
  UPDATE private.run21_matches SET state=shifted,paused_at=NULL,bot_due_at=bot_due_at+delta,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_pause() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW EXECUTE FUNCTION private.run21_pause();

-- Any admitted real-money competitor sitting out pauses through the shared owner.
CREATE FUNCTION private.run21_sitting_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; saved jsonb; result jsonb;
BEGIN
 IF NOT NEW.sitting_out OR OLD.sitting_out OR NEW.is_bot THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'run21' OR NOT g.real_money OR g.is_paused OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.run21_matches m WHERE m.dealer_game_id=g.current_game_uuid AND m.financial_version=2
   AND NOT m.finished AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'id'=NEW.id::text)) THEN RETURN NEW; END IF;
 saved:=private.capture_recovery_context();
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
 PERFORM private.restore_recovery_context(saved);
 IF result->>'outcome' NOT IN ('paused','already_set') THEN RAISE EXCEPTION 'run21:sit_out_pause_failed'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_sitting_out() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_sitting_out AFTER UPDATE OF sitting_out ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_sitting_out();

-- The shared rejoin action normally queues the next hand. A paused, admitted
-- real-money competitor instead returns to their existing unfinished match.
CREATE FUNCTION private.run21_return_player() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games;
BEGIN
 IF NOT NEW.waiting OR OLD.waiting OR NOT OLD.sitting_out THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'run21' OR NOT g.real_money OR NOT g.is_paused OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE NOWAIT;
 IF g.game_type='run21' AND g.real_money AND g.is_paused AND g.status='in_progress'
   AND EXISTS(SELECT 1 FROM private.run21_matches m WHERE m.dealer_game_id=g.current_game_uuid
     AND m.financial_version=2 AND NOT m.finished AND nullif(m.state->'settlement','null'::jsonb) IS NULL
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'id'=NEW.id::text)) THEN
   NEW.sitting_out:=false; NEW.waiting:=false;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_return_player() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_return_player BEFORE UPDATE OF waiting ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_return_player();

-- Canonical player intent owns automatic play; keep the private projection in
-- sync when the existing control lets a human resume their own board.
CREATE FUNCTION private.run21_automatic_play() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; m private.run21_matches; s jsonb; ids jsonb; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.auto_fold IS NOT DISTINCT FROM OLD.auto_fold OR NEW.is_bot THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'run21' OR g.real_money OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE NOWAIT;
 IF g.game_type IS DISTINCT FROM 'run21' OR g.real_money OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 SELECT * INTO m FROM private.run21_matches WHERE dealer_game_id=g.current_game_uuid AND financial_version=2 AND NOT finished FOR UPDATE NOWAIT;
 IF NOT FOUND OR m.state IS NULL OR nullif(m.state->'settlement','null'::jsonb) IS NOT NULL THEN RETURN NEW; END IF;
 SELECT coalesce(jsonb_agg(p.id ORDER BY p.id),'[]'::jsonb) INTO ids FROM public.players p
  WHERE p.game_id=g.id AND p.auto_fold AND NOT p.is_bot AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p.id::text);
 s:=jsonb_set(m.state,'{automaticPlayers}',ids);
 at_ms:=greatest(at_ms,(s->>'updatedAt')::bigint);
 IF s#>>'{rounds,-1,active_player_id}'=NEW.id::text AND s#>>ARRAY['rounds','-1','boards',NEW.id::text,'startedAt'] IS NULL THEN
  s:=jsonb_set(s,ARRAY['rounds','-1','boards',NEW.id::text,'firstPlacementDeadline'],
    CASE WHEN NEW.auto_fold THEN 'null'::jsonb ELSE to_jsonb(coalesce(m.paused_at,at_ms)+m.first_placement_seconds*1000) END);
 END IF;
 UPDATE private.run21_matches SET state=jsonb_set(s,'{updatedAt}',to_jsonb(at_ms)),revision=revision+1,
   bot_due_at=CASE WHEN s#>>'{rounds,-1,active_player_id}' IS DISTINCT FROM NEW.id::text THEN m.bot_due_at
     WHEN NEW.auto_fold THEN at_ms ELSE NULL END WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_automatic_play() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_automatic_play AFTER UPDATE OF auto_fold ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_automatic_play();
