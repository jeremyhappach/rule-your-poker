-- Run after candidate DDL inside BEGIN/ROLLBACK. Only newly created fixture UUIDs.
CREATE TEMP TABLE sealed_actors AS SELECT gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() outsider;
INSERT INTO auth.users(id) SELECT a FROM sealed_actors UNION ALL SELECT b FROM sealed_actors UNION ALL SELECT outsider FROM sealed_actors;
UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(SELECT a FROM sealed_actors UNION ALL SELECT b FROM sealed_actors UNION ALL SELECT outsider FROM sealed_actors);
INSERT INTO public.profiles(id,username,is_active) SELECT a,'sealed proof A',true FROM sealed_actors UNION ALL SELECT b,'sealed proof B',true FROM sealed_actors UNION ALL SELECT outsider,'sealed proof outsider',true FROM sealed_actors ON CONFLICT(id) DO UPDATE SET is_active=true;
CREATE FUNCTION pg_temp.sealed_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'sealed_proof:%',label;END IF;END$$;
CREATE FUNCTION pg_temp.sealed_fixture(game text,real_i boolean,accept_i boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid;b uuid;m uuid;hash text;
BEGIN
 SELECT x.a,x.b INTO a,b FROM sealed_actors x;PERFORM set_config('request.jwt.claim.sub',a::text,true);
 m:=public.delayed_create(gen_random_uuid(),b,real_i,jsonb_build_array(jsonb_build_object('game',game,'stake',3)));
 IF accept_i THEN
  SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');
 END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);RETURN m;
END $$;
CREATE FUNCTION pg_temp.sealed_empty(child uuid,actor uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;b jsonb;s jsonb;at_ms bigint;due bigint;request uuid;fp jsonb;result jsonb;advanced boolean;game text;
BEGIN
 r:=public.delayed_sealed_load(child,actor);game:=r->>'game_type';s:=r->'state';at_ms:=floor(extract(epoch FROM (r->>'available_at')::timestamptz)*1000);
 b:=CASE WHEN game='tri-towers' THEN public.delayed_tri_core('deal',r->'config',(s->'totals'->>actor::text)::bigint,NULL,NULL,NULL,at_ms)
 WHEN game IN('crib-lab','chucky-showdown') THEN public.delayed_originals_core(child,'deal',(s->>'round')::int,(s->'totals'->>actor::text)::bigint,NULL,NULL,NULL,at_ms)
 WHEN game='take-two' THEN public.delayed_take_two_core(child,'deal',(s->>'round')::int,(s->'totals'->>actor::text)::bigint,NULL,NULL,NULL,at_ms)
 ELSE public.delayed_board_core(game,'deal',r->'config',(s->'totals'->>actor::text)::bigint,NULL,NULL,NULL,at_ms) END;
 request:=gen_random_uuid();fp:=jsonb_build_object('child',child,'revision',r->'revision','segment',r->'segment','intent',jsonb_build_object('type','start'));
 result:=public.delayed_sealed_commit(child,actor,(r->>'revision')::bigint,s||jsonb_build_object('board',b,'segmentStartedAt',at_ms),'action',at_ms,false,request,fp);
 PERFORM pg_temp.sealed_assert(result->>'outcome'='committed','start committed');
 PERFORM pg_temp.sealed_assert(public.delayed_sealed_commit(child,actor,(r->>'revision')::bigint,s,'action',at_ms,false,request,fp)->>'outcome'='duplicate','duplicate start');
 FOR i IN 1..128 LOOP
  r:=public.delayed_sealed_load(child,actor);s:=r->'state';b:=s->'board';
  due:=CASE WHEN game IN('crib-lab','chucky-showdown') THEN (b->>'nextDue')::bigint ELSE (b->>'deadline')::bigint END;
  b:=CASE WHEN game='tri-towers' THEN public.delayed_tri_core('reduce',r->'config',0,b,'tick',NULL,due)
  WHEN game IN('crib-lab','chucky-showdown') THEN public.delayed_originals_core(child,'reduce',(s->>'round')::int,(s->'totals'->>actor::text)::bigint,b,'tick',NULL,due)
  WHEN game='take-two' THEN public.delayed_take_two_core(child,'reduce',(s->>'round')::int,(s->'totals'->>actor::text)::bigint,b,'tick',NULL,due)
  ELSE public.delayed_board_core(game,'reduce',r->'config',0,b,'tick',ARRAY[]::int[],due) END;
  advanced:=b->>'phase'='stage_complete';
  IF advanced THEN s:=s||jsonb_build_object('board',NULL,'deck',NULL,'segmentStartedAt',NULL,'attempts',(s->'attempts')||jsonb_build_array(jsonb_build_object('actor',actor,'round',s->'round','score',(b->>'score')::bigint-(s->'totals'->>actor::text)::bigint,'at',due,'board',b)));
  ELSE s:=jsonb_set(s,'{board}',b);END IF;
  result:=public.delayed_sealed_commit(child,actor,(r->>'revision')::bigint,s,'tick',due,advanced);
  PERFORM pg_temp.sealed_assert(result->>'outcome'='committed','deadline committed');
  IF advanced THEN RETURN jsonb_build_object('request',request,'fingerprint',fp,'initial',r);END IF;
 END LOOP;
 RAISE EXCEPTION 'sealed_proof:recovery_bound';
END $$;
CREATE FUNCTION pg_temp.sealed_finance(m uuid,real_i boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE a uuid;b uuid;n bigint;receipt private.delayed_settlements;
BEGIN
 SELECT x.a,x.b INTO a,b FROM sealed_actors x;SET CONSTRAINTS ALL IMMEDIATE;
 SELECT * INTO STRICT receipt FROM private.delayed_settlements WHERE match_id=m;n:=receipt.organizer_delta;
 PERFORM pg_temp.sealed_assert(receipt.opponent_delta=-n,'balanced settlement');
 PERFORM pg_temp.sealed_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN n ELSE -n END) FROM public.players WHERE game_id=m),'actual canonical chips');
 PERFORM pg_temp.sealed_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN n ELSE -n END) FROM public.session_player_snapshots WHERE game_id=m),'atomic final snapshots');
 PERFORM pg_temp.sealed_assert((SELECT count(*)=CASE WHEN real_i THEN 2 ELSE 0 END AND coalesce(bool_and(amount=CASE WHEN profile_id=a THEN n ELSE -n END),true) FROM public.player_transactions WHERE source_game_id=m AND transaction_type='SessionResult'),'actual account postings');
 PERFORM pg_temp.sealed_assert((SELECT count(*)=CASE WHEN n=0 THEN 0 ELSE 1 END AND coalesce(bool_and(unmatched_deltas='{}' AND (transfers->0->>'amount')::bigint=abs(n)),true) FROM public.gameplay_transfer_batches WHERE game_id=m),'canonical balanced transfer');
 PERFORM pg_temp.sealed_assert(private.delayed_finalize(m)=to_jsonb(receipt),'terminal settlement replay');
 SET CONSTRAINTS ALL DEFERRED;
END $$;
DO $$
DECLARE a uuid;b uuid;outsider uuid;old_match uuid;m uuid;child uuid;hash text;h jsonb;reviews jsonb;command jsonb;before_s jsonb;game text;real_i boolean;revision_i bigint;
BEGIN
 SELECT x.a,x.b,x.outsider INTO a,b,outsider FROM sealed_actors x;
 old_match:=pg_temp.sealed_fixture('boxdrop',false,false);
 UPDATE private.delayed_sealed_release SET enabled=true WHERE singleton;
 SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=old_match;PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM public.delayed_respond(old_match,gen_random_uuid(),hash,'accept');
 PERFORM pg_temp.sealed_assert((SELECT policy_version='delayed/1' FROM private.delayed_matches WHERE id=old_match),'old invitation keeps policy');
 PERFORM pg_temp.sealed_assert(NOT EXISTS(SELECT FROM private.delayed_children WHERE match_id=old_match AND private.delayed_sealed(delayed_children)),'old invitation keeps alternating flow');
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
  FOREACH game IN ARRAY ARRAY['boxdrop','quintzee','tri-towers','take-two','crib-lab','chucky-showdown'] LOOP
   m:=pg_temp.sealed_fixture(game,real_i);SELECT id INTO child FROM private.delayed_children WHERE match_id=m;
   UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '12 hours' WHERE id=child;
   PERFORM pg_temp.sealed_assert((SELECT private.delayed_sealed_can_play(c,a) AND private.delayed_sealed_can_play(c,b) FROM private.delayed_children c WHERE id=child),'both round-one players admitted');
   IF game='tri-towers' THEN
    BEGIN PERFORM public.delayed_tri_bonus_step(child,a);RAISE EXCEPTION 'sealed_proof:legacy Tri route accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:sealed_flow_required' THEN RAISE;END IF;END;
   END IF;
   PERFORM set_config('request.jwt.claim.sub',a::text,true);h:=public.delayed_home(m);
   PERFORM pg_temp.sealed_assert(h#>>'{lineup,0,playable}'='true' AND h#>>ARRAY['lineup','0','completedRounds',a::text]='0','new card projection');
   BEGIN PERFORM public.delayed_sealed_load(child,outsider);RAISE EXCEPTION 'sealed_proof:outsider accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   FOR round_i IN 1..4 LOOP
    EXIT WHEN (SELECT terminal FROM private.delayed_children WHERE id=child);
    IF (SELECT private.delayed_sealed_can_play(c,a) FROM private.delayed_children c WHERE id=child) THEN command:=pg_temp.sealed_empty(child,a);END IF;
    IF round_i=1 THEN
     PERFORM set_config('request.jwt.claim.sub',b::text,true);reviews:=public.delayed_reviews(child);h:=public.delayed_home(m);
     PERFORM pg_temp.sealed_assert(jsonb_array_length(reviews->'events')=0,'unpaired opponent result unavailable');
     PERFORM pg_temp.sealed_assert(h#>>ARRAY['lineup','0','completedRounds',a::text]='1' AND h#>>ARRAY['lineup','0','completedRounds',b::text]='0','counts disclose completion only');
     PERFORM pg_temp.sealed_assert(h#>>ARRAY['lineup','0','scores',a::text]='0','unpaired score sealed');
    END IF;
    IF (SELECT private.delayed_sealed_can_play(c,b) FROM private.delayed_children c WHERE id=child) THEN PERFORM pg_temp.sealed_empty(child,b);END IF;
    IF round_i=1 THEN PERFORM pg_temp.sealed_assert((SELECT (state->>'round')::int=2 FROM private.delayed_children WHERE id=child),'paired round opens successor');END IF;
   END LOOP;
   PERFORM pg_temp.sealed_assert((SELECT terminal FROM private.delayed_children WHERE id=child),'complete shared-core recovery');
   PERFORM pg_temp.sealed_finance(m,real_i);
   before_s:=(SELECT state FROM private.delayed_children WHERE id=child);
   PERFORM public.delayed_sealed_commit(child,a,0,'{}','action',0,false,(command->>'request')::uuid,command->'fingerprint');
   PERFORM pg_temp.sealed_assert((SELECT state=before_s FROM private.delayed_children WHERE id=child),'late replay preserves terminal state');
  END LOOP;
 END LOOP;
END $$;
SELECT jsonb_build_object('status','PASS','scope','sealed shared-rule rounds, both financial modes, legacy invitation, disclosure, recovery, replay, terminal') sealed_proof;
