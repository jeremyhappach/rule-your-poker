-- New-match orchestration only. Admission remains off until client and worker publication.
CREATE TABLE IF NOT EXISTS private.delayed_sealed_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.delayed_sealed_release(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE private.delayed_sealed_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_sealed_release FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.delayed_sealed(c private.delayed_children) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(c.state->>'version'='delayed/sealed/1',false)
$$;
CREATE OR REPLACE FUNCTION private.delayed_sealed_can_play(c private.delayed_children,who uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT c.terminal AND coalesce((c.state->'required')?who::text,false)
 AND NOT coalesce((c.state#>>ARRAY['parts',who::text,'submitted'])::boolean,true)
$$;
CREATE OR REPLACE FUNCTION private.delayed_sealed_policy() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (SELECT enabled FROM private.delayed_sealed_release WHERE singleton) THEN NEW.policy_version:='delayed/sealed/1';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS delayed_sealed_policy ON private.delayed_matches;
CREATE TRIGGER delayed_sealed_policy BEFORE INSERT ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.delayed_sealed_policy();

CREATE OR REPLACE FUNCTION private.delayed_sealed_initial(c private.delayed_children,m private.delayed_matches) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 SELECT jsonb_build_object('version','delayed/sealed/1','game',c.game_type,'child',c.id,'players',jsonb_build_array(m.organizer,m.opponent),
 'round',1,'turn',0,'totals',jsonb_build_object(m.organizer::text,0,m.opponent::text,0),'attempts','[]'::jsonb,'board',NULL,'completed',false,'winner',NULL,
 'required',jsonb_build_array(m.organizer,m.opponent),'parts',(SELECT jsonb_object_agg(who::text,jsonb_build_object('board',NULL,'deck',NULL,'segmentStartedAt',NULL,'segment',1,'lastRevision',1,'submitted',false)) FROM unnest(ARRAY[m.organizer,m.opponent]) who))
$$;

CREATE OR REPLACE FUNCTION private.delayed_sealed_record(c private.delayed_children,who uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r jsonb:=private.delayed_child_record(c);s jsonb:=c.state;part jsonb:=s#>ARRAY['parts',who::text];idx int;available boolean;
BEGIN
 idx:=CASE WHEN s->'players'->>0=who::text THEN 0 ELSE 1 END;available:=private.delayed_sealed_can_play(c,who);
 RETURN r||jsonb_build_object('sealed',true,'partRevision',part->'lastRevision','segment',part->'segment',
 'actor',CASE WHEN available OR c.terminal THEN to_jsonb(who) ELSE s->'players'->(1-idx) END,
 'started_at',to_timestamp((part->>'segmentStartedAt')::bigint/1000.0),
 'state',(s-ARRAY['parts','required','optionalBonus'])||jsonb_build_object('version','delayed/1','turn',idx,'board',part->'board','deck',part->'deck','segmentStartedAt',part->'segmentStartedAt')||
 CASE WHEN s#>>'{optionalBonus,actor}'=who::text THEN jsonb_build_object('optionalBonus',s->'optionalBonus') ELSE '{}' END);
END $$;

CREATE OR REPLACE FUNCTION public.delayed_sealed_load(p_child uuid,p_actor uuid,p_request uuid DEFAULT NULL,p_recovery boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;receipt private.delayed_commands;
BEGIN
 -- Only the service role can call this RPC. The recovery worker may read a
 -- disabled participant's saved board; action commits still require access.
 IF NOT coalesce(p_recovery,false) THEN PERFORM private.delayed_actor(p_actor);END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NULL OR p_actor NOT IN(m.organizer,m.opponent) OR NOT private.delayed_sealed(c) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 SELECT * INTO receipt FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_sealed_record(c,p_actor)||jsonb_build_object('receipt',CASE WHEN receipt.request_id IS NOT NULL THEN to_jsonb(receipt) END);
END $$;

CREATE OR REPLACE FUNCTION private.delayed_sealed_eligible(c private.delayed_children,s jsonb,who text,round_i int) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE cfg jsonb:=c.config;score_i bigint:=(s->'totals'->>who)::bigint;
BEGIN
 RETURN CASE c.game_type
 WHEN 'run21' THEN round_i<=(cfg->>'rounds')::int OR (s->'totals'->>(s->'players'->>0))::bigint=(s->'totals'->>(s->'players'->>1))::bigint
 WHEN 'tri-towers' THEN round_i<=(cfg->>'stages')::int OR round_i<=(cfg->>'stages')::int+(cfg->>'maxBonusStages')::int AND private.tri_towers_bonus_qualified_v2(score_i,cfg)
 WHEN 'quintzee' THEN round_i<=private.quintzee_required_rounds(score_i)
 WHEN 'boxdrop' THEN round_i<=private.boxdrop_required_rounds(score_i)
 WHEN 'mega-card-golf' THEN round_i<=(cfg#>>'{course,holes}')::int
 ELSE round_i<=3 END;
END $$;

CREATE OR REPLACE FUNCTION public.delayed_sealed_commit(p_child uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_event text,p_at bigint,p_advanced boolean,p_request uuid DEFAULT NULL,p_fingerprint jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;receipt private.delayed_commands;s jsonb;part jsonb;attempt jsonb;old_count int;new_count int;
 now_i timestamptz:=clock_timestamp();at_i timestamptz:=to_timestamp(p_at/1000.0);due_i timestamptz;board_due bigint;round_i int;required jsonb;who text;winner uuid;done boolean:=false;next_due bigint;bonus text;b jsonb;skipped boolean:=false;prior jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_request IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NULL OR p_actor NOT IN(m.organizer,m.opponent) OR NOT private.delayed_sealed(c) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF receipt.child_id<>p_child OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_sealed_record(c,p_actor));
  END IF;
 END IF;
 IF c.terminal OR c.revision<>p_revision THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_sealed_record(c,p_actor));END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 s:=c.state;part:=s#>ARRAY['parts',p_actor::text];round_i:=(s->>'round')::int;
 IF NOT private.delayed_sealed_can_play(c,p_actor) THEN RAISE EXCEPTION 'delayed:round_submitted';END IF;
 board_due:=CASE WHEN c.game_type IN('crib-lab','chucky-showdown') THEN (part#>>'{board,nextDue}')::bigint ELSE (part#>>'{board,deadline}')::bigint END;
 due_i:=CASE WHEN c.game_type='quintzee' AND board_due IS NOT NULL THEN to_timestamp(board_due/1000.0) ELSE least(c.expires_at,to_timestamp(board_due/1000.0)) END;
 IF p_event='action' THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_request IS NULL OR p_fingerprint IS NULL OR (p_fingerprint->>'segment')::bigint IS DISTINCT FROM (part->>'segment')::bigint
   OR (p_fingerprint->>'revision')::bigint<(part->>'lastRevision')::bigint THEN RAISE EXCEPTION 'delayed:stale_action';END IF;
  IF now_i>=due_i THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_sealed_record(c,p_actor));END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<due_i OR abs(extract(epoch FROM due_i)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick';END IF;
  IF due_i=c.expires_at AND (board_due IS NULL OR c.expires_at<=to_timestamp(board_due/1000.0)) AND c.game_type<>'quintzee' THEN
   SELECT a::uuid INTO winner FROM jsonb_array_elements_text(s->'required') a WHERE (s#>>ARRAY['parts',a,'submitted'])::boolean;
   PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'timeout_forfeit' END,winner,jsonb_build_object('round',round_i,'expiredAt',c.expires_at));
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_sealed_record(c,p_actor));
  ELSIF c.game_type='quintzee' AND board_due IS NULL THEN
   b:=public.delayed_board_core('quintzee','deal',c.config,(s->'totals'->>p_actor::text)::bigint,NULL,NULL,NULL,p_at-(c.config->>'durationMs')::bigint-(c.config->>'introMs')::bigint);
   b:=public.delayed_board_core('quintzee','reduce',c.config,0,b,'tick',ARRAY[]::int[],(b->>'deadline')::bigint);
   p_state:=(private.delayed_sealed_record(c,p_actor)->'state')||jsonb_build_object('board',NULL,'deck',NULL,'segmentStartedAt',NULL,'attempts',(s->'attempts')||jsonb_build_array(jsonb_build_object('actor',p_actor,'round',round_i,'score',0,'at',p_at,'board',b,'availabilityExpired',true)));
   p_advanced:=true;
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF at_i>now_i OR at_i<c.available_at-interval '1 millisecond' OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_state->>'version' IS DISTINCT FROM 'delayed/1' OR p_state->'players' IS DISTINCT FROM s->'players' OR (p_state->>'round')::int<>round_i OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 old_count:=jsonb_array_length(s->'attempts');new_count:=jsonb_array_length(p_state->'attempts');
 IF new_count<>old_count+(CASE WHEN p_advanced THEN 1 ELSE 0 END) OR EXISTS(SELECT FROM generate_series(0,old_count-1) i WHERE s->'attempts'->i IS DISTINCT FROM p_state->'attempts'->i) THEN RAISE EXCEPTION 'delayed:immutable_attempt';END IF;
 IF p_advanced THEN
  attempt:=p_state->'attempts'->-1;
  IF attempt->>'actor' IS DISTINCT FROM p_actor::text OR (attempt->>'round')::int<>round_i OR nullif(p_state->'board','null') IS NOT NULL THEN RAISE EXCEPTION 'delayed:invalid_attempt';END IF;
  s:=jsonb_set(s,'{attempts}',p_state->'attempts');s:=jsonb_set(s,ARRAY['totals',p_actor::text],to_jsonb((s->'totals'->>p_actor::text)::bigint+(attempt->>'score')::bigint));
 END IF;
 IF p_fingerprint#>>'{intent,type}' IN('bonus_play','bonus_skip') THEN
  IF s#>>'{optionalBonus,actor}' IS DISTINCT FROM p_actor::text OR s#>>'{optionalBonus,choice}' IS DISTINCT FROM 'pending' OR p_advanced THEN RAISE EXCEPTION 'delayed:bonus_unavailable';END IF;
  skipped:=p_fingerprint#>>'{intent,type}'='bonus_skip';
  s:=jsonb_set(s,'{optionalBonus,choice}',to_jsonb(CASE WHEN skipped THEN 'skip' ELSE 'play' END));
 END IF;
 IF c.game_type='mega-card-golf' THEN
  prior:=nullif(part->'board','null');
  IF prior IS NULL THEN SELECT a->'board' INTO prior FROM jsonb_array_elements(c.state->'attempts') a WHERE a->>'actor'=p_actor::text ORDER BY (a->>'round')::int DESC LIMIT 1;END IF;
  IF nullif(p_state->'board','null') IS NOT NULL THEN PERFORM private.mega_assert_board(p_state->'board',c.config,prior);END IF;
  IF p_advanced THEN PERFORM private.mega_assert_board(attempt->'board',c.config,part->'board');
   IF (attempt->>'score')::bigint IS DISTINCT FROM (attempt#>>'{board,results,-1,score}')::bigint OR attempt#>>'{board,phase}'<>'scoring' THEN RAISE EXCEPTION 'mega:invalid_hole_score';END IF;
  END IF;
 END IF;
 part:=part||jsonb_build_object('board',p_state->'board','deck',p_state->'deck','segmentStartedAt',p_state->'segmentStartedAt','lastRevision',c.revision+1,'submitted',p_advanced OR skipped,'segment',(part->>'segment')::bigint+CASE WHEN p_advanced OR skipped THEN 1 ELSE 0 END);
 s:=jsonb_set(s,ARRAY['parts',p_actor::text],part);
 IF s#>>'{optionalBonus,actor}'=p_actor::text AND s#>>'{optionalBonus,choice}'='pending' AND nullif(part->'board','null') IS NOT NULL THEN s:=jsonb_set(s,'{optionalBonus,choice}','"play"');END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements_text(s->'required') a WHERE NOT (s#>>ARRAY['parts',a,'submitted'])::boolean) THEN
  round_i:=round_i+1;
  SELECT coalesce(jsonb_agg(a),'[]') INTO required FROM jsonb_array_elements_text(s->'players') a WHERE private.delayed_sealed_eligible(c,s,a,round_i);
  done:=jsonb_array_length(required)=0;s:=(s-'optionalBonus')||jsonb_build_object('round',round_i,'required',required,'completed',done);
  IF done THEN
   IF (s->'totals'->>(s->'players'->>0))::bigint<>(s->'totals'->>(s->'players'->>1))::bigint THEN
    winner:=(s->'players'->>CASE WHEN ((s->'totals'->>(s->'players'->>0))::bigint>(s->'totals'->>(s->'players'->>1))::bigint)<>(c.game_type='mega-card-golf') THEN 0 ELSE 1 END)::uuid;
   END IF;
   s:=s||jsonb_build_object('winner',winner);
  ELSE
   FOR who IN SELECT jsonb_array_elements_text(s->'players') LOOP
    s:=jsonb_set(s,ARRAY['parts',who,'submitted'],to_jsonb(NOT(required?who)));
    s:=jsonb_set(s,ARRAY['parts',who,'segment'],to_jsonb((s#>>ARRAY['parts',who,'segment'])::bigint+1));
   END LOOP;
   IF m.real_money THEN bonus:=private.optional_bonus_async_actor(c.game_type,c.config,s);IF bonus IS NOT NULL THEN s:=s||jsonb_build_object('optionalBonus',jsonb_build_object('actor',bonus,'choice','pending'));END IF;END IF;
   c.available_at:=at_i;c.segment:=c.segment+1;
  END IF;
 END IF;
 SELECT min(CASE WHEN c.game_type IN('crib-lab','chucky-showdown') THEN (value#>>'{board,nextDue}')::bigint ELSE (value#>>'{board,deadline}')::bigint END) INTO next_due FROM jsonb_each(s->'parts');
 UPDATE private.delayed_children SET state=s,revision=revision+1,available_at=c.available_at,segment=c.segment,started_at=NULL,gameplay_due_at=to_timestamp(next_due/1000.0) WHERE id=c.id RETURNING * INTO c;
 IF done THEN PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,jsonb_build_object('rules',c.config,'finalState',s));
 ELSE UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;PERFORM private.delayed_notify(m.id);END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_sealed_record(c,p_actor));
END $$;

REVOKE ALL ON FUNCTION public.delayed_sealed_load(uuid,uuid,uuid,boolean),public.delayed_sealed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_sealed_load(uuid,uuid,uuid,boolean),public.delayed_sealed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION private.delayed_sealed(private.delayed_children),private.delayed_sealed_can_play(private.delayed_children,uuid),private.delayed_sealed_policy(),private.delayed_sealed_initial(private.delayed_children,private.delayed_matches),private.delayed_sealed_record(private.delayed_children,uuid),private.delayed_sealed_eligible(private.delayed_children,jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.delayed_tri_bonus_step(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_segment bigint DEFAULT NULL::bigint, p_intent jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb;decision jsonb;
BEGIN
 IF EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND private.delayed_sealed(delayed_children)) THEN RAISE EXCEPTION 'delayed:sealed_flow_required';END IF;
 v:=public.delayed_tri_step(p_child,p_actor,p_request,p_revision,p_segment,p_intent);
 SELECT state->'optionalBonus' INTO decision FROM private.delayed_children WHERE id=p_child;
 RETURN v||CASE WHEN decision IS NOT NULL AND (decision->>'actor'=p_actor::text OR (v->>'terminal')::boolean) THEN jsonb_build_object('optionalBonus',decision) ELSE '{}'::jsonb END;
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 IF p_action='cancel' THEN
  PERFORM private.delayed_delete_pending_invitation(m.id);
  response:=jsonb_build_object('status','cancelled','deleted',true);
  INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
  RETURN response;
 END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('five-alive','chess','ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   IF c.game_type IN('crib-lab','chucky-showdown') AND NOT EXISTS(SELECT FROM private.originals_release WHERE game=c.game_type AND async_enabled AND (NOT m.real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'originals:async_closed';END IF;
   dealt:=NULL;
   IF c.game_type='five-alive' THEN
    IF NOT EXISTS(SELECT FROM private.five_alive_release WHERE singleton AND async_enabled AND (NOT m.real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
    dealt:=private.five_alive_async_deal(c.id,m.organizer,m.opponent,c.config->>'poolVersion');
   END IF;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
   IF c.game_type='chess' THEN
    IF NOT private.chess_actor_allowed(m.organizer) OR NOT private.chess_actor_allowed(m.opponent) OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND enabled AND admission_enabled AND async_enabled AND (NOT m.real_money OR real_qualified)) THEN RAISE EXCEPTION 'chess:async_closed';END IF;
    dealt:=private.chess_seed(jsonb_build_object('identity',jsonb_build_object('sessionId',m.id,'dealerGameId',c.id,'roundId',c.id),'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=first_actor THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=first_actor THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),'async',floor(extract(epoch FROM at_time)*1000)::bigint);
   END IF;
   IF m.policy_version='delayed/sealed/1' AND c.game_type IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') THEN
    first_actor:=m.organizer;dealt:=private.delayed_sealed_initial(c,m);
   END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 IF private.delayed_sealed(c) AND p_actor IS NOT NULL THEN RETURN public.delayed_sealed_load(p_child,p_actor,p_request);END IF;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_current_review_events e WHERE e.child_id=c.id AND e.kind='attempt' AND EXISTS(SELECT FROM private.delayed_current_review_events acknowledged JOIN private.delayed_review_seen s ON s.event_id=acknowledged.id AND s.viewer=p_actor WHERE acknowledged.child_id=e.child_id AND acknowledged.actor=e.actor AND acknowledged.kind='attempt' AND acknowledged.round>=e.round)),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 IF EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND private.delayed_sealed(delayed_children)) THEN RAISE EXCEPTION 'delayed:sealed_flow_required';END IF;
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=CASE WHEN c.game_type='quintzee' THEN coalesce(c.gameplay_due_at,c.expires_at) ELSE least(c.expires_at,c.gameplay_due_at) END;
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) AND NOT(c.game_type='quintzee' AND c.gameplay_due_at IS NOT NULL) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=CASE WHEN c.game_type IN('crib-lab','chucky-showdown') THEN (p_state#>>'{board,nextDue}')::bigint ELSE (p_state#>>'{board,deadline}')::bigint END;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_board_action(p_child uuid, p_actor uuid, p_game text, p_request uuid, p_revision bigint, p_segment bigint, p_intent jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 r jsonb; s jsonb; board jsonb; reduced jsonb; committed jsonb; visible jsonb;
 saved jsonb; own_boards jsonb:='[]'; items integer[]; action text:=p_intent->>'type';
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'segment',p_segment,'intent',p_intent);
 at_ms bigint;
BEGIN
 IF EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND private.delayed_sealed(delayed_children)) THEN RAISE EXCEPTION 'delayed:sealed_flow_required';END IF;
 IF p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_segment IS NULL
    OR p_game IS NULL OR p_game NOT IN('take-two','quintzee','boxdrop') THEN RAISE EXCEPTION 'delayed:invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 r:=public.delayed_load(p_child,p_actor,p_request);
 IF r->>'game_type' IS DISTINCT FROM p_game THEN RAISE EXCEPTION 'delayed:wrong_game'; END IF;
 s:=r->'state'; board:=s->'board'; at_ms:=(r->>'server_at')::bigint;
 IF nullif(r->'receipt','null') IS NOT NULL OR (r->>'held')::boolean OR (r->>'terminal')::boolean
    OR r->>'actor' IS DISTINCT FROM p_actor::text OR (r->>'revision')::bigint<>p_revision OR (r->>'segment')::bigint<>p_segment
    OR nullif(board,'null') IS NULL OR least((board->>'deadline')::bigint,floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000)::bigint)<=at_ms
 THEN RETURN jsonb_build_object('fallback',true); END IF;
 IF s->>'child' IS DISTINCT FROM p_child::text OR s->>'game' IS DISTINCT FROM p_game
    OR s->'players'->>((s->>'turn')::integer) IS DISTINCT FROM p_actor::text OR (s->>'completed')::boolean THEN RAISE EXCEPTION 'delayed:identity'; END IF;
 IF action IS NULL OR NOT (CASE p_game WHEN 'take-two' THEN action IN('pair','draw','take_score')
  WHEN 'quintzee' THEN action IN('roll','score','score_zero') ELSE action IN('place','recycle','take_score') END)
 THEN RAISE EXCEPTION 'delayed:invalid_action'; END IF;
 IF p_intent ? 'items' THEN
  IF jsonb_typeof(p_intent->'items')<>'array' OR jsonb_array_length(p_intent->'items')>5 THEN RAISE EXCEPTION 'delayed:invalid_items';END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(p_intent->'items') i WHERE jsonb_typeof(i)<>'number' OR i::text !~ '^-?[0-9]+$'
    OR i::text::numeric NOT BETWEEN (CASE WHEN action='pair' THEN -1 ELSE 0 END) AND (CASE WHEN action='pair' THEN 32 ELSE 2147483647 END)) THEN RAISE EXCEPTION 'delayed:invalid_items'; END IF;
  items:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(p_intent->'items') WITH ORDINALITY ORDER BY ordinality);
 ELSIF action IN('pair','roll','score','score_zero','place','recycle') THEN RAISE EXCEPTION 'delayed:invalid_items'; END IF;
 IF action='pair' AND (cardinality(items)<>2 OR items[1]=items[2]) THEN RAISE EXCEPTION 'delayed:invalid_items'; END IF;
 IF p_game='take-two' THEN
  reduced:=public.delayed_take_two_core(p_child,'reduce',(s->>'round')::int,(s->'totals'->>p_actor::text)::bigint,board,action,items,at_ms);
 ELSE
  reduced:=public.delayed_board_core(p_game,'reduce',r->'config',(s->'totals'->>p_actor::text)::bigint,board,action,items,at_ms);
 END IF;
 -- Reuse this exact roll/deal at a stage boundary. The existing adapter owns
 -- advancement, bonuses, authoritative settlement and revision conflict recovery.
 IF reduced->>'phase'='stage_complete' THEN RETURN jsonb_build_object('boundary',r,'reduced',reduced); END IF;
 committed:=public.delayed_commit(p_child,p_actor,p_revision,jsonb_set(s,'{board}',reduced),'action',at_ms,false,p_request,fingerprint);
 IF committed->>'outcome'<>'committed' THEN RETURN jsonb_build_object('fallback',true); END IF;
 r:=(committed->'record')||jsonb_build_object('reviewed',r->'reviewed');
 IF p_game='take-two' THEN visible:=public.delayed_take_two_core(p_child,'visible',p_board=>reduced);
 ELSE visible:=public.delayed_board_core(p_game,'visible',p_board=>reduced); END IF;
 FOR saved IN SELECT value->'board' FROM jsonb_array_elements(s->'attempts') WHERE value->>'actor'=p_actor::text LOOP
  own_boards:=own_boards||jsonb_build_array(CASE WHEN p_game='take-two' THEN public.delayed_take_two_core(p_child,'visible',p_board=>saved)
   ELSE public.delayed_board_core(p_game,'visible',p_board=>saved) END);
 END LOOP;
 RETURN jsonb_build_object('record',r,'visible',visible,'ownBoards',own_boards);
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_bonus_choice(p_child uuid, p_actor uuid, p_request uuid, p_revision bigint, p_segment bigint, p_choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r jsonb;s jsonb;fingerprint jsonb;at_ms bigint;committed jsonb;
BEGIN
 IF EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND private.delayed_sealed(delayed_children)) THEN RAISE EXCEPTION 'delayed:sealed_flow_required';END IF;
 IF p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_segment IS NULL OR p_choice IS NULL OR p_choice NOT IN('play','skip') THEN RAISE EXCEPTION 'bonus:invalid_command';END IF;
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 r:=public.delayed_load(p_child,p_actor,p_request);s:=r->'state';at_ms:=(r->>'server_at')::bigint;
 fingerprint:=jsonb_build_object('child',p_child,'revision',p_revision,'segment',p_segment,'intent',jsonb_build_object('type','bonus_'||p_choice));
 IF nullif(r->'receipt','null') IS NOT NULL THEN
  IF r#>>'{receipt,child_id}' IS DISTINCT FROM p_child::text OR r#>'{receipt,fingerprint}' IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
  RETURN r;
 END IF;
 IF (r->>'held')::boolean OR (r->>'terminal')::boolean OR r->>'actor' IS DISTINCT FROM p_actor::text
  OR (r->>'revision')::bigint<>p_revision OR (r->>'segment')::bigint<>p_segment THEN RAISE EXCEPTION 'delayed:stale_action';END IF;
 IF at_ms>=floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000) THEN RAISE EXCEPTION 'bonus:deadline';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=(r->>'match_id')::uuid AND real_money AND status='active')
  OR s#>>'{optionalBonus,choice}' IS DISTINCT FROM 'pending' OR s#>>'{optionalBonus,actor}' IS DISTINCT FROM p_actor::text
  OR private.optional_bonus_async_actor(r->>'game_type',r->'config',s) IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'bonus:not_eligible' USING ERRCODE='42501';END IF;
 s:=jsonb_set(s,'{optionalBonus,choice}',to_jsonb(p_choice));
 IF p_choice='skip' THEN s:=s||jsonb_build_object('completed',true,'winner',p_actor);END IF;
 -- Existing commit owns immutable outcome, actual finances, notices and archival.
 -- Play preserves segment/availability/deadline. Skip adds no synthetic attempt.
 committed:=public.delayed_commit(p_child,p_actor,p_revision,s,'action',at_ms,p_choice='skip',p_request,fingerprint);
 IF committed->>'outcome' NOT IN('committed','duplicate') THEN RAISE EXCEPTION 'delayed:stale_action';END IF;
 RETURN committed->'record';
END $function$
;

CREATE OR REPLACE FUNCTION private.delayed_child_record(c private.delayed_children)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT to_jsonb(c)||jsonb_build_object('sealed',private.delayed_sealed(c),'organizer',m.organizer,'opponent',m.opponent,
  'status',m.status,'held',private.delayed_held(m.id),'server_at',floor(extract(epoch FROM clock_timestamp())*1000),
  'outcome',(SELECT jsonb_build_object('winner',o.winner,'reason',o.reason,'organizer_delta',o.organizer_delta,'opponent_delta',o.opponent_delta)
   FROM private.delayed_current_outcomes o WHERE o.child_id=c.id))
 FROM private.delayed_matches m WHERE m.id=c.match_id
$function$
;

CREATE OR REPLACE FUNCTION private.five_alive_or_actor(c private.delayed_children, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE game jsonb;round_i integer;idx integer;
BEGIN
 IF c.terminal OR p_actor IS NULL THEN RETURN false;END IF;
 IF private.delayed_sealed(c) THEN RETURN private.delayed_sealed_can_play(c,p_actor);END IF;
 IF c.game_type<>'five-alive' THEN RETURN c.actor=p_actor;END IF;
 game:=c.state->'fiveAlive';round_i:=(game->>'current')::integer;
 IF round_i IS NULL OR round_i NOT BETWEEN 0 AND 2 THEN RETURN false;END IF;
 idx:=CASE WHEN game->'players'->>0=p_actor::text THEN 0 WHEN game->'players'->>1=p_actor::text THEN 1 ELSE NULL END;
 IF idx IS NULL THEN RETURN false;END IF;
 RETURN coalesce((game->'rounds'->idx->round_i->>'completed')::boolean=false,false);
END $function$
;

CREATE OR REPLACE FUNCTION private.optional_bonus_async_offer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor text;
BEGIN
 IF private.delayed_sealed(NEW) THEN RETURN NEW;END IF;
 IF coalesce(OLD.state->>'round','1')<>'3' AND NEW.state->>'round'='3'
    AND EXISTS(SELECT FROM private.delayed_matches WHERE id=NEW.match_id AND real_money) THEN
  actor:=private.optional_bonus_async_actor(NEW.game_type,NEW.config,NEW.state);
  IF actor IS NOT NULL AND actor=NEW.actor::text THEN
   NEW.state:=NEW.state||jsonb_build_object('optionalBonus',jsonb_build_object('actor',actor,'choice','pending'));
  END IF;
 ELSIF NEW.state#>>'{optionalBonus,choice}'='pending' AND nullif(NEW.state->'board','null') IS NOT NULL THEN
  -- Backward-compatible Start from an older client is an explicit Play choice.
  NEW.state:=jsonb_set(NEW.state,'{optionalBonus,choice}','"play"');
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION private.delayed_expire(child uuid, expected_segment bigint, expected_expiry timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 IF private.delayed_sealed(c) THEN RETURN false;END IF;
 IF c.game_type='chess' AND NOT m.real_money THEN RETURN false; END IF;
 IF c.game_type='five-alive' THEN RETURN private.five_alive_async_expire(c,m,expected_segment,expected_expiry); END IF;
 -- An entered live-rules Words turn is governed solely by its playable deadline.
 IF c.game_type='ptown-words' AND c.config->>'version' IN ('ptown-words/2','ptown-words/4') AND c.gameplay_due_at IS NOT NULL THEN
  IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment
     OR c.expires_at IS DISTINCT FROM expected_expiry OR clock_timestamp()<c.gameplay_due_at THEN RETURN false; END IF;
  PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'tick',NULL,(c.state->>'deadline')::bigint),clock_timestamp());
  RETURN true;
 END IF;
 IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment OR c.expires_at IS DISTINCT FROM expected_expiry
  OR c.expires_at IS NULL OR clock_timestamp()<c.expires_at THEN RETURN false; END IF;
 -- An earlier active-game deadline must be resolved by the game adapter first.
 IF c.gameplay_due_at IS NOT NULL AND c.gameplay_due_at<c.expires_at THEN RETURN false; END IF;
 IF c.game_type='chess' THEN
  PERFORM private.chess_sync('async',c.id);RETURN (SELECT terminal FROM private.delayed_children WHERE id=c.id);
 ELSIF c.game_type='ptown-words' THEN
  IF c.config->>'version'='ptown-words/3' THEN
   PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'pass',NULL,(c.state->>'deadline')::bigint-1),clock_timestamp());
  ELSE
   PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'tick',NULL,greatest((c.state->>'deadline')::bigint,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)),clock_timestamp());
  END IF;
  RETURN true;
 ELSIF c.game_type='quintzee' THEN
  IF c.gameplay_due_at IS NOT NULL THEN RETURN false;END IF;
  PERFORM private.delayed_quintzee_missed_turn(c,m);RETURN true;
 END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',CASE WHEN c.actor=m.organizer THEN m.opponent ELSE m.organizer END,
  jsonb_build_object('segment',c.segment,'expiredAt',c.expires_at,'actor',c.actor));
 RETURN true;
END $function$
;

CREATE OR REPLACE FUNCTION private.mega_delayed_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE attempt jsonb;person text;prior jsonb;i integer:=0;total bigint;count_i integer;low bigint;winners jsonb;
BEGIN
 IF NEW.game_type<>'mega-card-golf' OR NEW.state IS NULL THEN RETURN NEW;END IF;
 IF NEW.config IS DISTINCT FROM OLD.config OR NEW.match_id IS DISTINCT FROM OLD.match_id OR NEW.stake IS DISTINCT FROM OLD.stake THEN RAISE EXCEPTION 'mega:immutable_configuration';END IF;
 IF NEW.state->>'child' IS DISTINCT FROM NEW.id::text OR NEW.state->>'game' IS DISTINCT FROM 'mega-card-golf' OR NEW.state->'players' IS DISTINCT FROM coalesce(OLD.state->'players',jsonb_build_array(NEW.starter,CASE WHEN NEW.starter=(SELECT organizer FROM private.delayed_matches WHERE id=NEW.match_id) THEN (SELECT opponent FROM private.delayed_matches WHERE id=NEW.match_id) ELSE (SELECT organizer FROM private.delayed_matches WHERE id=NEW.match_id) END)) THEN RAISE EXCEPTION 'mega:invalid_identity';END IF;
 IF NEW.state->'board' IS NOT NULL AND NEW.state->'board'<>'null'::jsonb THEN
  SELECT value->'board' INTO prior FROM jsonb_array_elements(coalesce(OLD.state->'attempts','[]')) WHERE value->>'actor'=NEW.actor::text ORDER BY (value->>'round')::integer DESC LIMIT 1;
  PERFORM private.mega_assert_board(NEW.state->'board',NEW.config,CASE WHEN OLD.state->'board'<>'null'::jsonb THEN OLD.state->'board' ELSE prior END);
 END IF;
 FOR attempt IN SELECT value FROM jsonb_array_elements(NEW.state->'attempts') LOOP
  i:=i+1;
  IF i<=jsonb_array_length(coalesce(OLD.state->'attempts','[]')) THEN
   IF attempt IS DISTINCT FROM OLD.state->'attempts'->(i-1) THEN RAISE EXCEPTION 'mega:immutable_hole';END IF;
  ELSE
   IF attempt->>'actor' IS DISTINCT FROM (CASE WHEN private.delayed_sealed(NEW) THEN attempt->>'actor' ELSE OLD.actor::text END) OR (attempt->>'round')::integer IS DISTINCT FROM coalesce((OLD.state->>'round')::integer,1) THEN RAISE EXCEPTION 'mega:invalid_turn';END IF;
   PERFORM private.mega_assert_board(attempt->'board',NEW.config,CASE WHEN private.delayed_sealed(NEW) THEN OLD.state#>ARRAY['parts',attempt->>'actor','board'] ELSE OLD.state->'board' END);
   IF (attempt->>'score')::bigint IS DISTINCT FROM (attempt#>>'{board,results,-1,score}')::bigint OR attempt#>>'{board,phase}' IS DISTINCT FROM 'scoring' THEN RAISE EXCEPTION 'mega:invalid_hole_score';END IF;
  END IF;
 END LOOP;
 IF i<jsonb_array_length(coalesce(OLD.state->'attempts','[]')) OR i>jsonb_array_length(coalesce(OLD.state->'attempts','[]'))+1 THEN RAISE EXCEPTION 'mega:invalid_transition';END IF;
 FOR person IN SELECT jsonb_array_elements_text(NEW.state->'players') LOOP
  SELECT coalesce(sum((value->>'score')::bigint),0),count(*) INTO total,count_i FROM jsonb_array_elements(NEW.state->'attempts') WHERE value->>'actor'=person;
  IF (NEW.state->'totals'->>person)::bigint IS DISTINCT FROM total OR count_i>(NEW.config#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
 END LOOP;
 IF (NEW.state->>'completed')::boolean THEN
  IF i<>2*(NEW.config#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:incomplete_course';END IF;
  SELECT min(value::bigint) INTO low FROM jsonb_each_text(NEW.state->'totals');
  SELECT jsonb_agg(key) INTO winners FROM jsonb_each_text(NEW.state->'totals') WHERE value::bigint=low;
  IF NEW.state->>'winner' IS DISTINCT FROM (CASE WHEN jsonb_array_length(winners)=1 THEN winners->>0 END) THEN RAISE EXCEPTION 'mega:invalid_winner';END IF;
 END IF;RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION private.delayed_take_two_review_allowed(e private.delayed_review_events, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN private.delayed_sealed(c) THEN e.actor=who OR e.kind='child' OR e.round<(c.state->>'round')::int ELSE (c.game_type<>'take-two' AND (c.game_type<>'crib-lab' OR NOT (c.config->>'sharedDeck')::boolean)) OR c.terminal OR e.kind='child' OR e.actor=who OR EXISTS(
  SELECT FROM private.delayed_current_review_events own WHERE own.child_id=e.child_id AND own.actor=who AND own.kind='attempt' AND own.round=e.round)
 END FROM private.delayed_children c WHERE c.id=e.child_id
$function$
;

CREATE OR REPLACE FUNCTION public.delayed_home_before_reviews(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;who uuid:=auth.uid();lineup jsonb;net bigint;finished integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'ordinal',c.ordinal,'game',c.game_type,'stake',c.stake,'config',c.config,
  'starter',c.starter,'actor',c.actor,'segment',c.segment,'revision',c.revision,'terminal',c.terminal,
  'availableAt',c.available_at,'lastCallAt',c.last_call_at,'expiresAt',c.expires_at,'startedAt',c.started_at,'scores',private.delayed_child_scores(c),'lastMove',c.state->'moves'->-1,
  'result',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'at',o.completed_at,
   'delta',CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END) ORDER BY c.ordinal),
  coalesce(sum(CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END),0),count(o.child_id)
 INTO lineup,net,finished FROM private.delayed_children c LEFT JOIN private.delayed_current_outcomes o ON o.child_id=c.id WHERE c.match_id=m.id;
 RETURN jsonb_build_object('policyVersion',m.policy_version,'id',m.id,'status',m.status,'revision',m.revision,'realMoney',m.real_money,'offerHash',m.offer_hash,
  'organizer',m.organizer,'opponent',m.opponent,'players',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',username)) FROM public.profiles WHERE id IN(m.organizer,m.opponent)),
  'createdAt',m.created_at,'invitationExpiresAt',m.expires_at,'acceptedAt',m.accepted_at,'settledAt',m.settled_at,
  'correction',(SELECT jsonb_build_object('id',id,'reason',reason,'at',created_at,'originalResult',original_outcome,'reversed',true) FROM private.delayed_current_corrections WHERE match_id=m.id),'held',private.delayed_held(m.id),'lineup',lineup,'net',net,'completed',finished,
  'exposure',(SELECT sum(stake) FROM private.delayed_children WHERE match_id=m.id),
  'receipt',(SELECT to_jsonb(s) FROM private.delayed_current_settlements s WHERE match_id=m.id),
  'removedAt',(SELECT removed_at FROM private.delayed_removals WHERE match_id=m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=p_match)
  AND EXISTS(SELECT FROM public.delayed_match_updates WHERE match_id=p_match AND user_id=who) THEN
  RAISE EXCEPTION 'delayed:invitation_cancelled' USING ERRCODE='P0002';
 END IF;
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  item:=item||jsonb_build_object('playable',
   h->>'status'='active' AND NOT (h->>'held')::boolean AND NOT c.terminal AND c.actor=who
   AND ((c.game_type='chess' AND NOT (h->>'realMoney')::boolean) OR least(c.expires_at,c.gameplay_due_at)>statement_timestamp()),
   'untimed',c.game_type='chess' AND NOT (h->>'realMoney')::boolean,
   'playableDeadline',least(c.expires_at,c.gameplay_due_at));
  -- Existing lobby ordering, presence and resume links use the current actionable deadline.
  IF (c.game_type='chess' OR c.game_type='ptown-words' AND c.config->>'version' IN ('ptown-words/2','ptown-words/4')) AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='chess' THEN scores:=NULL;
  ELSIF c.game_type='ptown-words' THEN
   FOR person IN SELECT jsonb_array_elements_text(jsonb_build_array(h->>'organizer',h->>'opponent')) LOOP
    SELECT count(*) INTO pending_count FROM private.delayed_current_review_events e
     WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND person<>who::text
      AND e.round>(private.delayed_words_reveal_state(c.id,who)->>'boundary')::integer
      AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who);
    IF person=who::text OR c.terminal AND viewed THEN shown:=coalesce((c.state->'scores'->>person)::bigint,0);
    ELSE
     SELECT (b.board->'scores'->>person)::bigint INTO shown
      FROM private.delayed_current_review_events e
      JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who
      JOIN private.delayed_review_boards b ON b.event_id=e.id
      WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person ORDER BY e.round DESC LIMIT 1;
     shown:=(private.delayed_words_reveal_state(c.id,who)#>>ARRAY['scores',person])::bigint;
    END IF;
    scores:=scores||jsonb_build_object(person,shown);
    pending_counts:=pending_counts||jsonb_build_object(person,least(pending_count,1));
   END LOOP;
   -- The latest move itself also carries unviewed points.
   item:=item-'lastMove';
  ELSIF c.game_type='five-alive' THEN
   IF c.state->'fiveAlive' IS NOT NULL THEN
    scores:=jsonb_build_object(c.state#>>'{fiveAlive,players,0}',c.state#>'{fiveAlive,sharedScores,0}',c.state#>>'{fiveAlive,players,1}',c.state#>'{fiveAlive,sharedScores,1}');
   END IF;
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR c.terminal AND viewed OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round>=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,least(pending_count,1));
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'crib-lab' THEN 3 WHEN 'chucky-showdown' THEN 3
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;

 IF private.delayed_sealed(c) THEN
  SELECT jsonb_object_agg(q.person_key,q.score),jsonb_object_agg(q.person_key,q.completed),jsonb_object_agg(q.person_key,q.pending)
   INTO scores,progress,pending_counts FROM (
    SELECT player.id person_key,coalesce(sum((a->>'score')::bigint) FILTER(WHERE player.id=who::text OR (a->>'round')::int<(c.state->>'round')::int),0) score,
     count(a) completed,count(a) FILTER(WHERE player.id<>who::text AND (a->>'round')::int>=(c.state->>'round')::int) pending
    FROM jsonb_array_elements_text(c.state->'players') player(id) LEFT JOIN LATERAL jsonb_array_elements(c.state->'attempts') a ON a->>'actor'=player.id GROUP BY player.id
   ) q;
  item:=item||jsonb_build_object('flowVersion','delayed/sealed/1','completedRounds',progress,'round',c.state->'round',
   'playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND private.delayed_sealed_can_play(c,who),
   'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND private.delayed_sealed_can_play(c,CASE WHEN who::text=h->>'organizer' THEN (h->>'opponent')::uuid ELSE (h->>'organizer')::uuid END),
   'startedAt',to_timestamp((c.state#>>ARRAY['parts',who::text,'segmentStartedAt'])::bigint/1000.0));
 END IF;
 item:=item||jsonb_build_object('reviewCount',(SELECT count(*) FROM private.delayed_current_review_events e
  WHERE e.child_id=c.id AND c.terminal AND e.kind='child'
   AND private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who)
   AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who)));
 lineup:=lineup||jsonb_build_array(item||CASE WHEN c.game_type='five-alive' THEN jsonb_build_object('round',least(3,coalesce((c.state#>>'{fiveAlive,current}')::int,0)+1),'playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,who),'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,CASE WHEN who::text=(h->>'organizer') THEN (h->>'opponent')::uuid ELSE (h->>'organizer')::uuid END)) ELSE '{}'::jsonb END||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round>=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_reviews(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();answer jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id AND who IN(organizer,opponent);
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'actor',e.actor,'round',e.round,'score',e.score,
  'at',e.completed_at,'receipt',e.receipt,'actorName',(SELECT username FROM public.profiles WHERE id=e.actor),'board',b.board,
 'beforeScore',CASE WHEN c.game_type='ptown-words' AND e.kind='attempt'
 THEN (b.board#>>ARRAY['scores',e.actor::text])::bigint-e.score END,
 'afterScore',CASE WHEN c.game_type='ptown-words' AND e.kind='attempt'
 THEN (b.board#>>ARRAY['scores',e.actor::text])::bigint END,'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)) ORDER BY e.completed_at,e.kind DESC),'[]') INTO answer
 FROM private.delayed_current_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child') AND private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who);
 RETURN jsonb_build_object('events',answer,
 'turnReviewId',(SELECT e->>'id' FROM jsonb_array_elements(answer) e
 WHERE e->>'kind'='attempt'
 ORDER BY (e->>'round')::integer DESC,(e->>'at')::timestamptz DESC LIMIT 1),
 'revealedThrough',CASE WHEN c.game_type='ptown-words' THEN (private.delayed_words_reveal_state(c.id,who)->>'boundary')::integer END,
 'finalBoard',CASE WHEN c.terminal AND c.game_type='ptown-words'
  THEN private.delayed_words_view(c.id,who)||private.ptown_words_visible(c.state,who::text) END,'terminal',c.terminal,'actor',CASE WHEN private.delayed_sealed(c) THEN (private.delayed_sealed_record(c,who)->>'actor')::uuid ELSE c.actor END,'segment',CASE WHEN private.delayed_sealed(c) THEN (c.state#>>ARRAY['parts',who::text,'segment'])::bigint ELSE c.segment END,'revision',c.revision,'started',CASE WHEN private.delayed_sealed(c) THEN nullif(c.state#>ARRAY['parts',who::text,'board'],'null') IS NOT NULL ELSE c.started_at IS NOT NULL END,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;

CREATE OR REPLACE FUNCTION private.delayed_presence_allowed(topic_i text, publishing boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  CROSS JOIN LATERAL (SELECT who FROM unnest(ARRAY[m.organizer,m.opponent]) who WHERE CASE WHEN private.delayed_sealed(c) THEN private.delayed_sealed_can_play(c,who) ELSE who=c.actor END) participant
  WHERE topic_i='delayed-playing:'||m.id::text||':'||c.id::text||':'||participant.who::text||':'||floor(extract(epoch FROM c.expires_at)*1000)::bigint::text
   AND auth.uid() IN(m.organizer,m.opponent) AND (NOT publishing OR auth.uid()=participant.who)
   AND m.status='active' AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id) AND NOT c.terminal
   AND c.available_at<=statement_timestamp() AND c.expires_at>statement_timestamp()
   AND NOT private.delayed_held(m.id)
 );
$function$
;

CREATE OR REPLACE FUNCTION private.async_badge_snapshot(who uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 WITH matches AS MATERIALIZED (
  SELECT m.* FROM private.delayed_matches m
  WHERE who IN(m.organizer,m.opponent) AND m.status IN('active','settled')
   AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id)
 ), work AS (
  SELECT c.id FROM matches m JOIN private.delayed_children c ON c.match_id=m.id
  WHERE (m.status='active' AND NOT private.delayed_held(m.id) AND NOT c.terminal
   AND CASE WHEN (c.game_type='five-alive' OR private.delayed_sealed(c)) THEN c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,who)
    ELSE private.five_alive_or_actor(c,who) AND ((c.game_type='chess' AND NOT m.real_money)
     OR least(c.expires_at,c.gameplay_due_at)>statement_timestamp()) END)
   OR (c.terminal AND EXISTS(SELECT FROM private.delayed_current_review_events e
    WHERE e.child_id=c.id AND e.kind='child'
     AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)))
  UNION ALL
  SELECT m.id FROM matches m WHERE m.status='settled'
   AND EXISTS(SELECT FROM private.delayed_current_settlements s WHERE s.match_id=m.id)
   AND private.delayed_reviews_complete(m.id,who)
   AND NOT EXISTS(SELECT FROM private.delayed_current_finale_seen s WHERE s.match_id=m.id AND s.viewer=who)
 )
 SELECT jsonb_build_object('count',(SELECT count(*) FROM work),
  'version',floor(extract(epoch FROM statement_timestamp())*1000000))
$function$
;

CREATE OR REPLACE FUNCTION private.push_sync(parent uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches; who uuid; ks text[]; fresh text[]; old private.push_episodes; kind_i text; event_i uuid;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 FOREACH who IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT coalesce(array_agg(c.id::text||':'||c.segment ORDER BY c.id),'{}') INTO ks
   FROM private.delayed_children c WHERE c.match_id=parent AND private.five_alive_or_actor(c,who) AND NOT c.terminal AND (c.expires_at>clock_timestamp() OR c.game_type='chess' AND NOT m.real_money)
   AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
   AND m.status='active' AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=parent);
  INSERT INTO private.push_episodes(match_id,user_id) VALUES(parent,who) ON CONFLICT DO NOTHING;
  SELECT * INTO old FROM private.push_episodes WHERE match_id=parent AND user_id=who FOR UPDATE;
  SELECT coalesce(array_agg(k),'{}') INTO fresh FROM unnest(ks) k WHERE NOT k=ANY(old.keys);
  -- Last Call retains child/segment identity; turn alerts open only from zero availability.
  IF cardinality(fresh)>0 THEN
   old.epoch:=old.epoch+1;
   IF cardinality(old.keys)=0 THEN old.turn_epoch:=old.epoch; END IF;
   FOREACH kind_i IN ARRAY ARRAY['turn','last_call'] LOOP
    IF kind_i='turn' AND cardinality(old.keys)>0 THEN CONTINUE; END IF;
    IF kind_i='last_call' AND NOT EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent AND c.last_call_at IS NOT NULL AND c.id::text||':'||c.segment=ANY(fresh)) THEN CONTINUE;END IF;
    INSERT INTO private.push_events(match_id,user_id,epoch,kind,keys) VALUES(parent,who,old.epoch,kind_i,fresh) RETURNING id INTO event_i;
    -- Only devices/preferences opted in at transition time; no retrospective push flood.
    INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
     SELECT event_i,s.id,s.binding FROM private.push_subscriptions s JOIN private.push_match_preferences p ON p.user_id=s.user_id AND p.match_id=parent
     WHERE s.user_id=who AND NOT s.disabled AND p.enabled;
   END LOOP;
  END IF;
  UPDATE private.push_episodes SET keys=ks,epoch=old.epoch,
   turn_epoch=CASE WHEN cardinality(ks)=0 THEN NULL ELSE old.turn_epoch END
   WHERE match_id=parent AND user_id=who
   AND (keys IS DISTINCT FROM ks OR epoch<>old.epoch);
 END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION private.push_eligible(e private.push_events, s private.push_subscriptions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT NOT s.disabled AND s.user_id=e.user_id
 AND EXISTS(SELECT FROM auth.sessions WHERE id=s.session_id AND user_id=s.user_id AND (not_after IS NULL OR not_after>clock_timestamp()))
 AND EXISTS(SELECT FROM public.profiles WHERE id=s.user_id AND is_active)
 AND ((e.kind='registration' AND public.has_role(e.user_id,'admin'::public.app_role)
   AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND registrations_enabled)
   AND EXISTS(SELECT FROM public.account_access WHERE user_id=e.registration_user_id AND NOT enabled AND NOT ever_enabled))
 OR (e.kind='table_open'
  AND e.created_at+interval '5 minutes'>clock_timestamp()
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND new_table_enabled)
  AND EXISTS(SELECT FROM private.push_table_openings WHERE session_id=e.table_id AND host_id IS DISTINCT FROM e.user_id)
  AND private.push_table_allowed(e.table_id,e.user_id)
  -- Drop a table alert if any quiet minute has elapsed since its opening, even
  -- when the worker was asleep for that entire (short) window. No morning backlog.
  AND NOT EXISTS(SELECT FROM private.push_defaults p, LATERAL generate_series(date_trunc('minute',e.created_at),clock_timestamp(),interval '1 minute') t
   WHERE p.user_id=e.user_id AND private.push_quiet_at(p,t)))
 OR (e.kind='invite'
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND invitations_enabled)
  AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND m.opponent=e.user_id
   AND m.status='invited' AND m.accepted_at IS NULL AND m.expires_at>clock_timestamp()
   AND NOT private.delayed_held(m.id) AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)))
 OR (e.kind IN('turn','last_call') AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND ((e.kind='turn' AND turn_epoch=e.epoch AND cardinality(keys)>0) OR (e.kind='last_call' AND keys&&e.keys)))
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND private.five_alive_or_actor(c,e.user_id) AND NOT c.terminal
  AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys))
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND (c.expires_at>clock_timestamp() OR c.game_type='chess' AND c.state->>'timingPolicy'='play-money-untimed/1' AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=c.match_id AND NOT m.real_money)) AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()))));
$function$
;