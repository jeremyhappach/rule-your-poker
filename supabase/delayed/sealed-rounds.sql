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
