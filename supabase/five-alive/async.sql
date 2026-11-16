-- Candidate adapter for the existing delayed match and settlement owners.
-- This file does not register or enable Five Alive admission.
CREATE FUNCTION private.five_alive_async_deal(p_child uuid,p_organizer uuid,p_opponent uuid,p_pool text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE answers jsonb;rounds jsonb;game jsonb;
BEGIN
 IF p_child IS NULL OR p_organizer IS NULL OR p_opponent IS NULL OR p_organizer=p_opponent THEN
  RAISE EXCEPTION 'five_alive:invalid_game';
 END IF;
 answers:=private.five_alive_allocate('async',p_child,p_pool);
 SELECT jsonb_agg(jsonb_build_object('answer',a->>'word','difficulty',a->'difficulty','guesses','[]'::jsonb,'completed',false) ORDER BY ord)
 INTO rounds FROM jsonb_array_elements(answers) WITH ORDINALITY x(a,ord);
 game:=jsonb_build_object('players',jsonb_build_array(p_organizer,p_opponent),'answers',answers,
  'rounds',jsonb_build_array(rounds,rounds),'sharedScores',jsonb_build_array(0,0),'current',0);
 RETURN jsonb_build_object('version','delayed/1','game','five-alive','child',p_child,'fiveAlive',game);
END $$;

-- Service-only load. Never return this full private row directly to a browser.
CREATE FUNCTION public.delayed_five_alive_load(p_child uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 PERFORM private.require_account_enabled(p_actor);PERFORM private.delayed_actor(p_actor);
 PERFORM private.delayed_words_check_health();PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor NOT IN(m.organizer,m.opponent) OR c.game_type<>'five-alive' OR m.status NOT IN('active','settled')
  OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 IF NOT c.terminal AND NOT private.delayed_held(m.id) THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END,
  'actor_revision',(SELECT coalesce(max(revision),0) FROM private.delayed_commands WHERE child_id=c.id AND actor=p_actor));
END $$;
REVOKE ALL ON FUNCTION public.delayed_five_alive_load(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_five_alive_load(uuid,uuid,uuid) TO service_role;

-- Called only by the authenticated service after applying the shared reducer.
-- The parent/child locks and existing command receipt serialize both players.
CREATE FUNCTION public.delayed_five_alive_commit(p_child uuid,p_actor uuid,p_request uuid,p_revision bigint,
 p_segment bigint,p_fingerprint jsonb,p_game jsonb,p_winner uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;old_g jsonb;old_r jsonb;new_r jsonb;
 normalized jsonb;idx integer;round_i integer;next_i integer;other_i integer;n integer;done boolean;advanced boolean;at_time timestamptz;
BEGIN
 PERFORM private.require_account_enabled(p_actor);PERFORM private.delayed_actor(p_actor);
 PERFORM private.delayed_words_check_health();PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:invalid_command';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor NOT IN(m.organizer,m.opponent) OR c.game_type<>'five-alive'
  OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.segment IS DISTINCT FROM p_segment OR c.terminal THEN
  RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c));
 END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 IF c.expires_at IS NULL THEN RAISE EXCEPTION 'five_alive:missing_deadline';END IF;
 at_time:=clock_timestamp();
 IF at_time>=c.expires_at THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
  RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c));
 END IF;
 old_g:=c.state->'fiveAlive';round_i:=(old_g->>'current')::integer;
 IF round_i NOT BETWEEN 0 AND 2 OR old_g->'players' IS DISTINCT FROM jsonb_build_array(m.organizer,m.opponent)
  OR (p_game->>'current') !~ '^[0-3]$' THEN RAISE EXCEPTION 'five_alive:invalid_state';END IF;
 idx:=CASE WHEN p_actor=m.organizer THEN 0 ELSE 1 END;other_i:=1-idx;
 old_r:=old_g->'rounds'->idx->round_i;new_r:=p_game->'rounds'->idx->round_i;
 IF old_r IS NULL OR new_r IS NULL OR (old_r->>'completed')::boolean IS DISTINCT FROM false
  OR jsonb_typeof(new_r->'guesses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'five_alive:invalid_round';END IF;
 n:=jsonb_array_length(new_r->'guesses');
 IF n NOT BETWEEN 1 AND 6 OR n<>jsonb_array_length(old_r->'guesses')+1
  OR (new_r->'guesses')-(n-1) IS DISTINCT FROM old_r->'guesses'
  OR new_r->'answer' IS DISTINCT FROM old_r->'answer' OR new_r->'difficulty' IS DISTINCT FROM old_r->'difficulty'
  OR new_r#>>ARRAY['guesses',(n-1)::text,'word'] !~ '^[A-Z]{5}$'
  OR (new_r->>'completed')::boolean IS DISTINCT FROM (n=6 OR new_r#>>ARRAY['guesses',(n-1)::text,'word']=old_r->>'answer')
 THEN RAISE EXCEPTION 'five_alive:invalid_transition';END IF;
 advanced:=(new_r->>'completed')::boolean AND (old_g->'rounds'->other_i->round_i->>'completed')::boolean;
 IF jsonb_typeof(p_game->'sharedScores') IS DISTINCT FROM 'array' OR jsonb_array_length(p_game->'sharedScores')<>2
  OR (NOT advanced AND p_game->'sharedScores' IS DISTINCT FROM old_g->'sharedScores') THEN RAISE EXCEPTION 'five_alive:invalid_scores';END IF;
 normalized:=jsonb_set(p_game,'{current}',old_g->'current');
 normalized:=jsonb_set(normalized,'{sharedScores}',old_g->'sharedScores');
 normalized:=jsonb_set(normalized,ARRAY['rounds',idx::text,round_i::text],old_r);
 IF normalized IS DISTINCT FROM old_g THEN RAISE EXCEPTION 'five_alive:invalid_transition';END IF;
 next_i:=round_i+CASE WHEN advanced THEN 1 ELSE 0 END;
 IF (p_game->>'current')::integer IS DISTINCT FROM next_i OR (next_i<3 AND p_winner IS NOT NULL)
  OR (p_winner IS NOT NULL AND p_winner NOT IN(m.organizer,m.opponent)) THEN RAISE EXCEPTION 'five_alive:invalid_outcome';END IF;
 done:=next_i=3;
 UPDATE private.delayed_children SET state=jsonb_set(state,'{fiveAlive}',p_game),revision=revision+1,
  segment=segment+CASE WHEN advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN advanced AND NOT done THEN at_time ELSE available_at END,
  last_call_at=CASE WHEN advanced AND NOT done THEN at_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN advanced AND NOT done THEN at_time+interval '36 hours' ELSE expires_at END
 WHERE id=c.id RETURNING * INTO c;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_winner IS NULL THEN 'draw' ELSE 'normal' END,p_winner,
   jsonb_build_object('rules',c.config,'finalState',p_game));
 ELSE PERFORM private.delayed_notify(m.id);END IF;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 INSERT INTO private.delayed_commands(actor,request_id,child_id,fingerprint,revision) VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $$;
REVOKE ALL ON FUNCTION public.delayed_five_alive_commit(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_five_alive_commit(uuid,uuid,uuid,bigint,bigint,jsonb,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.five_alive_async_deal(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- The shared delayed_expire owner calls this while holding parent and child
-- locks. A round's two availability deadlines start at the same unlock instant.
CREATE FUNCTION private.five_alive_async_expire(c private.delayed_children,m private.delayed_matches,
 p_segment bigint,p_expiry timestamptz) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE game jsonb:=c.state->'fiveAlive';round_i integer;first_done boolean;second_done boolean;winner uuid;reason_i text;
BEGIN
 IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>p_segment
  OR c.expires_at IS DISTINCT FROM p_expiry OR c.expires_at IS NULL OR clock_timestamp()<c.expires_at THEN RETURN false;END IF;
 round_i:=(game->>'current')::integer;
 IF round_i NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'five_alive:invalid_round';END IF;
 first_done:=(game->'rounds'->0->round_i->>'completed')::boolean;
 second_done:=(game->'rounds'->1->round_i->>'completed')::boolean;
 IF first_done IS NULL OR second_done IS NULL OR first_done AND second_done THEN RAISE EXCEPTION 'five_alive:invalid_round';END IF;
 IF NOT first_done AND NOT second_done THEN reason_i:='draw';winner:=NULL;
 ELSE reason_i:='timeout_forfeit';winner:=CASE WHEN first_done THEN m.organizer ELSE m.opponent END;END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,reason_i,winner,
  jsonb_build_object('round',round_i+1,'segment',c.segment,'expiredAt',c.expires_at,'bothExpired',NOT first_done AND NOT second_done));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.five_alive_async_expire(private.delayed_children,private.delayed_matches,bigint,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

-- Guard the source anchor so a changed shared owner cannot be silently patched.
DO $$
DECLARE src text;anchor text:=$anchor$ -- An entered live-rules Words turn is governed solely by its playable deadline.$anchor$;
 inserted text:=$inserted$ IF c.game_type='five-alive' THEN RETURN private.five_alive_async_expire(c,m,expected_segment,expected_expiry); END IF;
 -- An entered live-rules Words turn is governed solely by its playable deadline.$inserted$;
BEGIN
 src:=pg_get_functiondef('private.delayed_expire(uuid,bigint,timestamptz)'::regprocedure);
 IF strpos(src,$needle$private.five_alive_async_expire(c,m,expected_segment,expected_expiry)$needle$)>0 THEN RETURN;END IF;
 IF strpos(src,anchor)=0 OR strpos(substr(src,strpos(src,anchor)+length(anchor)),anchor)>0 THEN RAISE EXCEPTION 'five_alive:expiry_preimage_changed';END IF;
 EXECUTE replace(src,anchor,inserted);
END $$;
