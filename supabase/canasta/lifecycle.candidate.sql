-- LOCAL CANDIDATE. Canonical postgame continuation pattern; no registration or activation.
CREATE OR REPLACE FUNCTION private.canasta_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.canasta_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'canasta:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 -- Canonical pause freezes postgame continuation too. A resumed due worker retries.
 IF g.is_paused THEN RETURN;END IF;
 IF coalesce((m.settlement->>'deadline')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'canasta' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'canasta:close_identity';END IF;
 IF g.status<>'session_ended' THEN
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false WHERE game_id=m.game_id;
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL)<2 THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT array_agg(position ORDER BY position DESC) INTO positions FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL AND NOT is_bot;
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='canasta_terminal';
    SELECT position INTO next_seat FROM public.players WHERE id=winner AND game_id=m.game_id AND NOT is_bot AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
    IF next_seat IS NULL THEN IF cardinality(positions)=1 THEN next_seat:=positions[1];ELSE target:='dealer_selection';END IF;END IF;
   END IF;
   IF target IS NULL THEN
    IF next_seat IS NULL THEN SELECT max(p) INTO next_seat FROM unnest(positions) p WHERE p<g.dealer_position;next_seat:=coalesce(next_seat,positions[1]);END IF;
    target:=CASE WHEN next_seat IS NULL THEN 'dealer_selection' ELSE 'game_selection' END;
   END IF;
  END IF;
  UPDATE public.games SET status=target,game_type=CASE WHEN target='session_ended' THEN game_type END,
   current_game_uuid=NULL,config_complete=false,current_round=NULL,total_hands=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
   last_round_result=NULL,awaiting_next_round=false,next_round_number=NULL,game_over_at=NULL,pot=0,
   ante_decision_deadline=NULL,buck_position=NULL,is_first_hand=false,dealer_selection_state=NULL,
   dealer_position=coalesce(next_seat,dealer_position),config_deadline=CASE WHEN target='game_selection' THEN clock_timestamp()+make_interval(secs=>greatest(1,game_setup_timer_seconds)) END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=m.game_id;
 END IF;
 UPDATE private.canasta_matches SET finished=true,state=jsonb_set(state,'{revision}',to_jsonb(revision+1)),revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.canasta_close(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.canasta_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.canasta_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'canasta:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.canasta_finish_postgame(p_dealer_game_id);END $function$
;
CREATE FUNCTION private.canasta_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.canasta_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);s jsonb;episode bigint;remaining bigint;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'canasta' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.canasta_matches WHERE dealer_game_id=NEW.current_game_uuid FOR UPDATE;
 IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL THEN RETURN NEW;END IF;s:=m.state;
 IF NEW.is_paused THEN
  IF nullif(s->'pause','null'::jsonb) IS NOT NULL THEN RETURN NEW;END IF;
  episode:=(s->>'pauseEpisode')::bigint+1;remaining:=greatest(0,(s#>>'{hand,deadline}')::bigint-at_ms);
  s:=s||jsonb_build_object('pauseEpisode',episode,'pause',jsonb_build_object('at',at_ms,'remaining',remaining,'expired',remaining=0,'episode',episode,'reason','manual'));
 ELSE
  IF NEW.real_money AND EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=NEW.id AND p.sitting_out AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) seat WHERE seat->>'id'=p.id::text)) THEN RAISE EXCEPTION 'canasta:return_players_before_resume';END IF;
  IF nullif(s->'pause','null'::jsonb) IS NULL THEN RAISE EXCEPTION 'canasta:pause_identity';END IF;
  IF s->'hand'<>'null'::jsonb THEN
   remaining:=CASE WHEN (s#>>'{pause,expired}')::boolean THEN (private.canasta_rules()->>'turnMs')::bigint ELSE (s#>>'{pause,remaining}')::bigint END;
   s:=jsonb_set(jsonb_set(s,'{hand,deadline}',to_jsonb(at_ms+remaining)),'{hand,generation}',to_jsonb((s#>>'{hand,generation}')::bigint+1));
  END IF;
  s:=s||'{"pause":null}'::jsonb;
 END IF;
 UPDATE private.canasta_matches SET state=s||jsonb_build_object('revision',m.revision+1,'updatedAt',at_ms),revision=m.revision+1,
  bot_due_at=CASE WHEN NOT NEW.is_paused THEN at_ms+750 END WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
CREATE TRIGGER canasta_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW EXECUTE FUNCTION private.canasta_pause();
CREATE FUNCTION public.canasta_server_due() RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT m.dealer_game_id FROM private.canasta_matches m JOIN public.games g ON g.id=m.game_id
 WHERE NOT m.finished AND g.current_game_uuid=m.dealer_game_id AND g.game_type='canasta' AND NOT g.is_paused
 AND EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled)
 AND (m.state->'hand'='null'::jsonb OR m.state#>>'{hand,phase}'='complete' OR
  least((m.state#>>'{hand,deadline}')::bigint,m.bot_due_at)<=floor(extract(epoch FROM clock_timestamp())*1000))
 ORDER BY m.dealer_game_id LIMIT 20
$$;
REVOKE ALL ON FUNCTION private.canasta_finish_postgame(uuid),private.canasta_pause(),public.canasta_close(uuid),public.canasta_server_due() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.canasta_close(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.canasta_server_due() TO service_role;
CREATE FUNCTION public.canasta_server_finish(p_match uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT private.canasta_finish_postgame(p_match)
$$;
REVOKE ALL ON FUNCTION public.canasta_server_finish(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.canasta_server_finish(uuid) TO service_role;
CREATE FUNCTION private.canasta_player_control() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.canasta_matches;automatic jsonb;
BEGIN
 IF NEW.is_bot OR NEW.auto_fold IS NOT DISTINCT FROM OLD.auto_fold THEN RETURN NEW;END IF;
 SELECT c.* INTO m FROM private.canasta_matches c JOIN public.games g ON g.current_game_uuid=c.dealer_game_id AND g.id=c.game_id
 WHERE g.id=NEW.game_id AND g.game_type='canasta' AND NOT c.finished AND c.settlement IS NULL FOR UPDATE OF c;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=NEW.id::text)
  OR ((m.state->'automatic') ? NEW.id::text)=NEW.auto_fold THEN RETURN NEW;END IF;
 SELECT coalesce(jsonb_agg(a),'[]'::jsonb) INTO automatic FROM jsonb_array_elements(m.state->'automatic') a WHERE a<>to_jsonb(NEW.id::text);
 IF NEW.auto_fold THEN automatic:=automatic||jsonb_build_array(NEW.id);END IF;
 UPDATE private.canasta_matches SET state=jsonb_set(jsonb_set(state,'{automatic}',automatic),'{revision}',to_jsonb(revision+1)),revision=revision+1,
   bot_due_at=CASE WHEN NEW.auto_fold THEN floor(extract(epoch FROM clock_timestamp())*1000)+750 ELSE bot_due_at END WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
CREATE TRIGGER canasta_player_control AFTER UPDATE OF auto_fold ON public.players FOR EACH ROW EXECUTE FUNCTION private.canasta_player_control();
REVOKE ALL ON FUNCTION private.canasta_player_control() FROM PUBLIC,anon,authenticated,service_role;
