CREATE OR REPLACE FUNCTION private.ptown_words_schedule_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.state->'players') p WHERE NOT coalesce((p->>'isBot')::boolean,false)) THEN
  RAISE EXCEPTION 'ptown_words:human_required';
 END IF;
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
CREATE OR REPLACE FUNCTION private.ptown_words_recover(p_dealer_game_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.ptown_words_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.ptown_words_matches work JOIN public.games live ON live.id=work.game_id
  WHERE (p_dealer_game_id IS NULL OR work.dealer_game_id=p_dealer_game_id) AND NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.status='in_progress' AND live.game_type='ptown-words'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 2 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'ptown-words' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.ptown_words_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   m.state:=private.ptown_words_reduce(m.state,'tick',NULL,at_ms);
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   IF g.real_money IS DISTINCT FROM false THEN CONTINUE;END IF;
   choice:=private.ptown_words_bot_choice(private.ptown_words_visible(m.state,actor::text),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.ptown_words_reduce(m.state,choice->>'action',choice->'items',at_ms);
  END IF;
  UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.ptown_words_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.ptown_words_matches WHERE (p_dealer_game_id IS NULL OR dealer_game_id=p_dealer_game_id) AND NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.ptown_words_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;
CREATE TRIGGER ptown_words_bot_schedule BEFORE INSERT OR UPDATE ON private.ptown_words_matches FOR EACH ROW EXECUTE FUNCTION private.ptown_words_schedule_bot();
REVOKE ALL ON FUNCTION private.ptown_words_schedule_bot(),private.ptown_words_recover(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ptown_words_recover() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.ptown_words_recover(NULL::uuid) $$;
REVOKE ALL ON FUNCTION private.ptown_words_recover() FROM PUBLIC,anon,authenticated,service_role;
