CREATE OR REPLACE FUNCTION private.royal_flash_schedule_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
  OR NEW.state->>'phase' NOT IN ('ready','playing')
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN
  NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.royal_flash_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.royal_flash_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.royal_flash_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.real_money=false AND live.status='in_progress' AND live.game_type='royal-flash'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'royal-flash' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.royal_flash_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   FOR i IN 1..64 LOOP
 EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
 m.state:=private.royal_flash_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
 END LOOP;
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.royal_flash_bot_choice(private.royal_flash_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.royal_flash_reduce(m.state,choice->>'action',ARRAY[(choice->>'index')::integer],at_ms);
  END IF;
  UPDATE private.royal_flash_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.royal_flash_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.royal_flash_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.royal_flash_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;

CREATE TRIGGER royal_flash_bot_schedule BEFORE INSERT OR UPDATE ON private.royal_flash_matches FOR EACH ROW EXECUTE FUNCTION private.royal_flash_schedule_bot();
REVOKE ALL ON FUNCTION private.royal_flash_schedule_bot(),private.royal_flash_recover() FROM PUBLIC,anon,authenticated,service_role;
