-- One sequential board, typed actions, and the existing canonical financial owners.
CREATE FUNCTION private.originals_live_visible(m private.originals_live_matches, who uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=m.state; actor text:=s->'players'->(s->>'turnIndex')::int->>'id'; viewer uuid; financial jsonb;
BEGIN
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=who AND NOT is_bot;
 financial:=private.originals_live_record(m,who)->'financial';
 RETURN jsonb_build_object('id',m.dealer_game_id,'game',s#>>'{rules,game}','identity',s->'identity','rules',s->'rules',
 'revision',m.revision,'scope',concat_ws(':',m.round_id,s->>'round',s->>'turnIndex'),'round',s->'round',
 'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'phase',s->'phase','deadline',s->'deadline',
 'board',CASE WHEN s->'board'<>'null'::jsonb THEN private.originals_visible(s#>>'{rules,game}',s->'board',floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
  ||jsonb_build_object('id',m.dealer_game_id,'revision',m.revision,'ruleset',s#>>'{rules,ruleset}') END,
 'actor',actor,'viewerId',viewer,'players',(SELECT jsonb_agg(p||jsonb_build_object('chips',financial->'balances'->(p->>'id'))) FROM jsonb_array_elements(s->'players') p),
 'scores',s->'scores','results',s->'results','canAct',viewer::text=actor AND NOT m.finished AND m.settlement IS NULL AND m.paused_at IS NULL AND s->>'phase'='playing',
 'paused',m.paused_at IS NOT NULL,'pausedAt',m.paused_at,'settled',m.settlement IS NOT NULL,'settlement',m.settlement,'finished',m.finished,
 'terminal',s->'terminal','financial',financial);
END $$;

CREATE FUNCTION private.originals_live_reduce(s jsonb, intent jsonb, at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor text; board jsonb; round_i int:=(s->>'round')::int; turn_i int:=(s->>'turnIndex')::int; result jsonb;
BEGIN
 IF s->>'phase'='complete' THEN RETURN s;END IF;
 IF s->>'phase' IN('ready','round_complete') THEN
  IF intent->>'type'<>'tick' OR at_ms<(s->>'deadline')::bigint THEN RAISE EXCEPTION 'originals:transition_pending';END IF;
  IF s->>'phase'='round_complete' THEN
   turn_i:=turn_i+1;IF turn_i=jsonb_array_length(s->'players') THEN turn_i:=0;round_i:=round_i+1;END IF;
  END IF;
  actor:=s->'players'->turn_i->>'id';
  board:=private.originals_board(s#>>'{rules,game}','deal',s->'rules',round_i,(s->'scores'->>actor)::bigint,NULL,at_ms);
  RETURN s||jsonb_build_object('round',round_i,'turnIndex',turn_i,'phase','playing','board',board,'deadline',board->'nextDue');
 END IF;
 actor:=s->'players'->turn_i->>'id';
 board:=private.originals_board(s#>>'{rules,game}','reduce',s->'rules',round_i,(s->'scores'->>actor)::bigint,s->'board',at_ms,
  intent->>'type',CASE WHEN intent?'items' THEN ARRAY(SELECT value::integer FROM jsonb_array_elements_text(intent->'items')) END,(intent->>'level')::int);
 s:=s||jsonb_build_object('board',board,'deadline',board->'nextDue');
 IF board->>'phase'='stage_complete' THEN
  result:=jsonb_build_object('actor',actor,'round',round_i,'score',(board->>'score')::bigint-(s->'scores'->>actor)::bigint,'at',at_ms);
  s:=jsonb_set(s,ARRAY['scores',actor],board->'score')||jsonb_build_object('phase','round_complete','results',(s->'results')||jsonb_build_array(result),
   'presentation',jsonb_build_object('startedAt',at_ms,'endsAt',board->'nextDue'));
  IF turn_i=jsonb_array_length(s->'players')-1 THEN
   s:=jsonb_set(s,'{rounds}',(s->'rounds')||jsonb_build_array(jsonb_build_object('round',round_i,'scores',s->'scores')));
   IF round_i=3 THEN s:=jsonb_set(s,'{phase}','"complete"');END IF;
  END IF;
 END IF;
 RETURN s;
END $$;

CREATE FUNCTION private.originals_live_step(match_id uuid, who uuid, request_id uuid DEFAULT NULL, expected_revision bigint DEFAULT NULL, intent jsonb DEFAULT NULL, token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.originals_live_matches;g public.games;r private.originals_live_requests;fingerprint text;at_ms bigint;next_state jsonb;n int:=0;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=match_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=match_id FOR UPDATE;
 PERFORM private.originals_live_authorize(m,who,token);
 fingerprint:=md5(jsonb_build_array(expected_revision,intent)::text);
 IF request_id IS NOT NULL THEN
  SELECT * INTO r FROM private.originals_live_requests WHERE dealer_game_id=match_id AND originals_live_requests.request_id=originals_live_step.request_id;
  IF FOUND THEN
   IF r.actor IS DISTINCT FROM who OR r.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'originals:request_conflict';END IF;
   RETURN private.originals_live_visible(m,who);
  END IF;
 END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF m.finished THEN RETURN private.originals_live_visible(m,who);END IF;
 IF m.paused_at IS NOT NULL OR g.is_paused THEN
  IF request_id IS NOT NULL THEN RAISE EXCEPTION 'originals:paused';END IF;
  RETURN private.originals_live_visible(m,who);
 END IF;
 IF m.settlement IS NOT NULL THEN
  PERFORM private.originals_live_finish_postgame(match_id);
  SELECT * INTO m FROM private.originals_live_matches WHERE dealer_game_id=match_id;
  RETURN private.originals_live_visible(m,who);
 END IF;
 IF g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM match_id OR g.game_type IS DISTINCT FROM m.state#>>'{rules,game}' THEN RAISE EXCEPTION 'originals:inactive';END IF;
 IF request_id IS NOT NULL THEN
  IF who IS NULL OR expected_revision IS DISTINCT FROM m.revision OR intent IS NULL OR jsonb_typeof(intent)<>'object' THEN RAISE EXCEPTION 'originals:stale_action';END IF;
  IF m.state->'players'->(m.state->>'turnIndex')::int->>'userId' IS DISTINCT FROM who::text THEN RAISE EXCEPTION 'originals:not_actor';END IF;
  IF intent->>'type' NOT IN('select','lock','pass','replace','swap','stand','fold','stay','press') OR (intent-ARRAY['type','items','level'])<>'{}' THEN RAISE EXCEPTION 'originals:invalid_action';END IF;
  IF at_ms>=(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'originals:deadline';END IF;
  next_state:=private.originals_live_reduce(m.state,intent,at_ms);
  UPDATE private.originals_live_matches SET state=next_state,revision=revision+1 WHERE dealer_game_id=match_id RETURNING * INTO m;
  INSERT INTO private.originals_live_requests VALUES(match_id,request_id,who,fingerprint);
 ELSE
  WHILE m.state->>'phase'<>'complete' AND at_ms>=(m.state->>'deadline')::bigint AND n<128 LOOP
   next_state:=private.originals_live_reduce(m.state,'{"type":"tick"}',(m.state->>'deadline')::bigint);
   IF next_state=m.state THEN RAISE EXCEPTION 'originals:nonadvancing_clock';END IF;
   UPDATE private.originals_live_matches SET state=next_state,revision=revision+1 WHERE dealer_game_id=match_id RETURNING * INTO m;
   n:=n+1;
  END LOOP;
 END IF;
 IF m.state->>'phase'='complete' THEN PERFORM private.originals_live_settle(match_id);SELECT * INTO m FROM private.originals_live_matches WHERE dealer_game_id=match_id;END IF;
 RETURN private.originals_live_visible(m,who);
END $$;

CREATE FUNCTION public.originals_live_snapshot(p_match uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'originals:authentication_required';END IF;RETURN private.originals_live_step(p_match,auth.uid());END $$;
CREATE FUNCTION public.originals_live_action(p_match uuid,p_request uuid,p_revision bigint,p_intent jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF auth.uid() IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'originals:authentication_required';END IF;RETURN private.originals_live_step(p_match,auth.uid(),p_request,p_revision,p_intent);END $$;
CREATE FUNCTION public.originals_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(game,live_enabled AND EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND is_active)
  AND (p_session_id IS NULL OR EXISTS(SELECT FROM public.players WHERE game_id=p_session_id AND user_id=auth.uid() AND status<>'left'))
  AND (p_session_id IS NULL OR NOT EXISTS(SELECT FROM public.games WHERE id=p_session_id AND real_money) OR live_real_qualified)),'{}') FROM private.originals_release
$$;

CREATE FUNCTION private.originals_shift(value jsonb, delta bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer jsonb:='{}';item record;
BEGIN
 IF jsonb_typeof(value)='array' THEN RETURN (SELECT coalesce(jsonb_agg(private.originals_shift(v,delta)),'[]') FROM jsonb_array_elements(value) v);END IF;
 IF jsonb_typeof(value)<>'object' THEN RETURN value;END IF;
 FOR item IN SELECT * FROM jsonb_each(value) LOOP
  answer:=answer||jsonb_build_object(item.key,CASE
   WHEN item.key IN('config','rules') THEN item.value
   WHEN item.key IN('since','due','deadline','nextDue','phaseUntil','startsAt','startedAt','endsAt','scoredAt') AND jsonb_typeof(item.value)='number' AND item.value::text<>'0' THEN to_jsonb(item.value::text::bigint+delta)
   ELSE private.originals_shift(item.value,delta) END);
 END LOOP;RETURN answer;
END $$;
CREATE FUNCTION private.originals_live_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.originals_live_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 SELECT * INTO m FROM private.originals_live_matches WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.originals_live_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN
  UPDATE private.originals_live_matches SET state=private.originals_shift(state,at_ms-m.paused_at),paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION private.originals_live_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.dealer_game_id IS DISTINCT FROM OLD.dealer_game_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
 OR NEW.stake IS DISTINCT FROM OLD.stake OR NEW.state->'identity' IS DISTINCT FROM OLD.state->'identity'
 OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules' OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players'
 OR NEW.revision<OLD.revision OR (OLD.finished AND NOT NEW.finished)
 OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement
 OR NEW.state-ARRAY['terminal','presentation','deadline','board'] IS DISTINCT FROM OLD.state-ARRAY['terminal','presentation','deadline','board']
 OR (NEW.state->'terminal')-ARRAY['startedAt','deadline'] IS DISTINCT FROM (OLD.state->'terminal')-ARRAY['startedAt','deadline']))
 THEN RAISE EXCEPTION 'originals:immutable_match';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER originals_live_guard BEFORE UPDATE ON private.originals_live_matches FOR EACH ROW EXECUTE FUNCTION private.originals_live_guard();
CREATE TRIGGER originals_live_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type IN('crib-lab','chucky-showdown') AND NEW.is_paused IS DISTINCT FROM OLD.is_paused) EXECUTE FUNCTION private.originals_live_pause();
CREATE FUNCTION public.originals_live_recover(p_token uuid) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row record;n int:=0;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_recovery_state WHERE singleton AND claimed AND token=p_token AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'originals:recovery_denied';END IF;
 FOR row IN SELECT dealer_game_id FROM private.originals_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000) ORDER BY created_at LIMIT 16 LOOP
  PERFORM private.originals_live_step(row.dealer_game_id,NULL,NULL,NULL,NULL,p_token);n:=n+1;
 END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.originals_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.originals_live_snapshot(uuid),public.originals_live_action(uuid,uuid,bigint,jsonb),public.originals_capabilities(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.originals_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.originals_live_snapshot(uuid),public.originals_live_action(uuid,uuid,bigint,jsonb),public.originals_capabilities(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.originals_live_load(uuid,uuid,uuid),public.originals_live_recover(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.originals_live_recover(uuid) TO service_role;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'originals_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
