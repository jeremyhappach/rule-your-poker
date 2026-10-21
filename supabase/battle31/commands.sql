-- All human, bot and timeout transitions share this locking/receipt/settlement owner.
CREATE OR REPLACE FUNCTION private.battle31_commit(p_dealer uuid,p_request uuid,p_revision bigint,p_player uuid,p_action text,p_items integer[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.battle31_matches;g public.games;prior private.battle31_requests;actor_i int;at_ms bigint;player_i public.players;choice jsonb;effective_action text;effective_items int[];result_i jsonb;claims_i text;role_i text;cmd jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items);
BEGIN
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer FOR UPDATE;
 SELECT i-1 INTO actor_i FROM jsonb_array_elements(m.state->'players') WITH ORDINALITY x(p,i) WHERE p->>'id'=p_player::text;
 IF actor_i IS NULL OR p_request IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'battle31:participant_required' USING ERRCODE='42501';END IF;
 SELECT * INTO prior FROM private.battle31_requests WHERE dealer_game_id=p_dealer AND request_id=p_request;
 IF FOUND THEN IF prior.actor<>p_player OR (prior.command-ARRAY['resolvedAction','resolvedItems'])<>cmd THEN RAISE EXCEPTION 'battle31:replay_conflict';END IF;RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.game_type IS DISTINCT FROM 'battle-31' OR g.status<>'in_progress' OR m.finished OR (g.is_paused AND p_action NOT IN('autoplay_on','autoplay_off')) THEN RAISE EXCEPTION 'battle31:inactive';END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'battle31:stale_revision';END IF;
 IF p_action NOT IN('resign','autoplay_on','autoplay_off') AND actor_i<>(m.state->>'turnIndex')::int THEN RAISE EXCEPTION 'battle31:wrong_turn';END IF;
 IF p_action NOT IN('swap','take_pot','pass','resign','tick','bot','autoplay_on','autoplay_off') THEN RAISE EXCEPTION 'battle31:invalid_action';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action='tick' AND at_ms<(m.state->>'deadline')::bigint THEN RETURN;END IF;
 SELECT * INTO STRICT player_i FROM public.players WHERE id=p_player AND game_id=g.id FOR UPDATE;
 IF p_action IN('autoplay_on','autoplay_off') THEN
  IF player_i.is_bot OR player_i.user_id IS DISTINCT FROM auth.uid() OR m.settlement IS NOT NULL THEN RAISE EXCEPTION 'battle31:forbidden' USING ERRCODE='42501';END IF;
  result_i:=public.set_automatic_play(g.id,m.round_id,p_dealer,p_player,player_i.intent_version,p_action='autoplay_on');
  IF result_i->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'battle31:stale_control';END IF;
  INSERT INTO private.battle31_requests VALUES(p_dealer,p_request,p_player,cmd);
  RETURN;
 END IF;
 IF p_action IN('swap','take_pot','pass') AND player_i.auto_fold THEN RAISE EXCEPTION 'battle31:not_controller';END IF;
 IF p_action='bot' AND NOT(player_i.is_bot OR player_i.auto_fold) THEN RAISE EXCEPTION 'battle31:not_controller';END IF;
 effective_action:=p_action;effective_items:=p_items;
 IF p_action='tick' AND m.state->>'phase'='playing' AND NOT(player_i.is_bot OR player_i.auto_fold) THEN
  INSERT INTO private.battle31_requests VALUES(p_dealer,p_request,p_player,cmd);
  IF g.real_money THEN
   -- Restore a full decision before canonical pause freezes it. No card action.
   UPDATE private.battle31_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms+(m.state#>>'{rules,turnMs}')::bigint)),revision=revision+1 WHERE dealer_game_id=p_dealer;
   claims_i:=coalesce(current_setting('request.jwt.claims',true),'');role_i:=coalesce(current_setting('request.jwt.claim.role',true),'');
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);PERFORM set_config('request.jwt.claim.role','service_role',true);
   result_i:=public.set_game_paused(g.id,true,p_dealer,g.pause_version);
   PERFORM set_config('request.jwt.claims',claims_i,true);PERFORM set_config('request.jwt.claim.role',role_i,true);
   IF result_i->>'outcome' NOT IN('paused','already_set') THEN RAISE EXCEPTION 'battle31:pause_failed:%',result_i;END IF;
  ELSE
   -- Canonical participation flags; the strategic worker owns subsequent moves.
   UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p_player;
  END IF;
  RETURN;
 END IF;
 IF p_action='bot' OR p_action='tick' AND m.state->>'phase'='playing' THEN
  IF NOT(player_i.is_bot OR player_i.auto_fold) THEN RAISE EXCEPTION 'battle31:not_controller';END IF;
  choice:=private.battle31_bot_choice(private.battle31_visible(m.state,p_player));effective_action:=choice->>'action';
  SELECT array_agg(value::int) INTO effective_items FROM jsonb_array_elements_text(coalesce(nullif(choice->'items','null'),'[]'));
  -- A delayed service run still makes a legal strategic decision, not a human timeout.
  IF at_ms>=(m.state->>'deadline')::bigint THEN m.state:=jsonb_set(m.state,'{deadline}',to_jsonb(at_ms+(m.state#>>'{rules,turnMs}')::bigint));END IF;
 END IF;
 m.state:=private.battle31_reduce(m.state,effective_action,CASE WHEN p_action='resign' THEN ARRAY[actor_i] ELSE effective_items END,at_ms);
 -- Preserve the actual selected move in the existing receipt; retries compare
 -- the original service command, without recomputing a strategic choice.
 INSERT INTO private.battle31_requests VALUES(p_dealer,p_request,p_player,CASE WHEN p_action='bot' OR p_action='tick' AND effective_action<>'tick' THEN cmd||jsonb_build_object('resolvedAction',effective_action,'resolvedItems',effective_items) ELSE cmd END);
 UPDATE private.battle31_matches SET state=m.state,revision=revision+1,bot_due_at=at_ms+750 WHERE dealer_game_id=p_dealer;
 IF m.state->>'phase'='complete' THEN PERFORM private.battle31_settle(p_dealer);END IF;
END $$;
CREATE OR REPLACE FUNCTION public.battle31_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 IF NOT private.battle31_actor_allowed(auth.uid()) OR p_action IS NULL OR p_action NOT IN('swap','take_pot','pass','resign','autoplay_on','autoplay_off') THEN RAISE EXCEPTION 'battle31:forbidden' USING ERRCODE='42501';END IF;
 SELECT (p->>'id')::uuid INTO actor FROM private.battle31_matches m,jsonb_array_elements(m.state->'players') p WHERE m.dealer_game_id=p_dealer_game_id AND p->>'userId'=auth.uid()::text AND NOT (p->>'isBot')::boolean;
 IF actor IS NULL THEN RAISE EXCEPTION 'battle31:participant_required' USING ERRCODE='42501';END IF;
 PERFORM private.battle31_commit(p_dealer_game_id,p_request_id,p_revision,actor,p_action,p_items);
 RETURN public.battle31_snapshot(p_dealer_game_id);
END $$;
-- An integrity abort is an administrative operation, never a browser command.
CREATE OR REPLACE FUNCTION private.battle31_abort(p_dealer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.battle31_matches;
BEGIN
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 PERFORM 1 FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN;END IF;
 UPDATE private.battle31_matches SET state=private.battle31_complete(state,'aborted',floor(extract(epoch FROM clock_timestamp())*1000)::bigint),revision=revision+1 WHERE dealer_game_id=p_dealer;
 PERFORM private.battle31_settle(p_dealer);
END $$;

-- Bridge canonical participation changes into Battle 31 revision/projection ownership.
-- The round/session locks held by canonical controls serialize this with actions.
CREATE OR REPLACE FUNCTION private.battle31_control_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.battle31_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);current_i boolean;
BEGIN
 IF ROW(NEW.auto_fold,NEW.sit_out_next_hand,NEW.intent_version) IS NOT DISTINCT FROM ROW(OLD.auto_fold,OLD.sit_out_next_hand,OLD.intent_version) THEN RETURN NEW;END IF;
 SELECT work.* INTO m FROM private.battle31_matches work JOIN public.games g ON g.id=work.game_id AND g.current_game_uuid=work.dealer_game_id
 WHERE work.game_id=NEW.game_id AND g.game_type='battle-31' AND NOT work.finished AND work.settlement IS NULL
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(work.state->'players') p WHERE p->>'id'=NEW.id::text) FOR UPDATE OF work;
 IF NOT FOUND THEN RETURN NEW;END IF;
 current_i:=m.state->'players'->(m.state->>'turnIndex')::int->>'id'=NEW.id::text AND m.state->>'phase'='playing';
 UPDATE private.battle31_matches SET revision=revision+1,
 state=CASE WHEN current_i AND NEW.auto_fold IS DISTINCT FROM OLD.auto_fold THEN jsonb_set(state,'{deadline}',to_jsonb(coalesce(paused_at,at_ms)+(m.state#>>'{rules,turnMs}')::bigint)) ELSE state END,
 bot_due_at=CASE WHEN current_i AND NEW.auto_fold THEN at_ms+750 WHEN current_i THEN NULL ELSE bot_due_at END
 WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
