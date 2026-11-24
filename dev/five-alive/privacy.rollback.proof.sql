-- Reuses the accepted Five Alive financial proof, with completed-history confidentiality assertions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
CREATE FUNCTION pg_temp.fa_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'relative_proof:%',label;END IF;END$$;

-- CANDIDATE_SQL
-- IDEMPOTENCE_SQL
CREATE TEMP TABLE fa_actors AS SELECT gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() outsider;
INSERT INTO auth.users(id) SELECT a FROM fa_actors UNION ALL SELECT b FROM fa_actors UNION ALL SELECT outsider FROM fa_actors;
UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(SELECT a FROM fa_actors UNION ALL SELECT b FROM fa_actors UNION ALL SELECT outsider FROM fa_actors);
INSERT INTO public.profiles(id,username,is_active) SELECT a,'relative proof A',true FROM fa_actors UNION ALL SELECT b,'relative proof B',true FROM fa_actors UNION ALL SELECT outsider,'relative proof outsider',true FROM fa_actors ON CONFLICT(id) DO UPDATE SET is_active=true;
CREATE FUNCTION pg_temp.fa_fixture(real_i boolean,child_count integer DEFAULT 1) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE m uuid;a uuid;b uuid;hash text;BEGIN
 SELECT x.a,x.b INTO a,b FROM fa_actors x;PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SELECT public.delayed_create(gen_random_uuid(),b,real_i,(SELECT jsonb_agg(jsonb_build_object('game','five-alive','stake',7)) FROM generate_series(1,child_count))) INTO m;
 SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');PERFORM set_config('request.jwt.claim.sub','',true);RETURN m;
END$$;
CREATE FUNCTION pg_temp.fa_guess(child uuid,actor uuid,word text) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE c private.delayed_children;g jsonb;r jsonb;idx int;ri int;ni int;feedback jsonb:='[]';scores jsonb;tot int;win uuid;req uuid:=gen_random_uuid();fp jsonb;outcome jsonb;remaining text;status text;BEGIN
 SELECT * INTO c FROM private.delayed_children WHERE id=child;g:=c.state->'fiveAlive';ri:=(g->>'current')::int;idx:=CASE WHEN g->'players'->>0=actor::text THEN 0 ELSE 1 END;r:=g->'rounds'->idx->ri;remaining:=r->>'answer';
 FOR k IN 1..5 LOOP IF substr(word,k,1)=substr(r->>'answer',k,1) THEN remaining:=overlay(remaining placing '.' from k for 1);END IF;END LOOP;
 FOR k IN 1..5 LOOP IF substr(word,k,1)=substr(r->>'answer',k,1) THEN status:='correct';ELSIF strpos(remaining,substr(word,k,1))>0 THEN status:='present';remaining:=overlay(remaining placing '.' from strpos(remaining,substr(word,k,1)) for 1);ELSE status:='absent';END IF;feedback:=feedback||jsonb_build_array(status);END LOOP;
 r:=jsonb_set(r,'{guesses}',(r->'guesses')||jsonb_build_array(jsonb_build_object('word',word,'feedback',feedback)));
 r:=jsonb_set(r,'{completed}',to_jsonb(word=r->>'answer' OR jsonb_array_length(r->'guesses')=6));g:=jsonb_set(g,ARRAY['rounds',idx::text,ri::text],r);
 ni:=ri+CASE WHEN (r->>'completed')::boolean AND (g->'rounds'->(1-idx)->ri->>'completed')::boolean THEN 1 ELSE 0 END;
 IF ni>ri THEN
  scores:='[]';FOR player_i IN 0..1 LOOP SELECT coalesce(sum(CASE WHEN rr->'guesses'->-1->>'word'=rr->>'answer' THEN round((ARRAY[1000,700,490,343,240,168])[jsonb_array_length(rr->'guesses')]*(60+20*(rr->>'difficulty')::int)/100.0) ELSE 0 END),0)::int INTO tot FROM jsonb_array_elements(g->'rounds'->player_i) WITH ORDINALITY x(rr,ord) WHERE ord<=ni;scores:=scores||jsonb_build_array(tot);END LOOP;g:=jsonb_set(g,'{sharedScores}',scores);
 END IF;
 g:=jsonb_set(g,'{current}',to_jsonb(ni));IF ni=3 AND (g->'sharedScores'->>0)::int<>(g->'sharedScores'->>1)::int THEN win:=(g->'players'->>CASE WHEN (g->'sharedScores'->>0)::int>(g->'sharedScores'->>1)::int THEN 0 ELSE 1 END)::uuid;END IF;
 fp:=jsonb_build_object('child',child,'revision',c.revision,'segment',c.segment,'intent',jsonb_build_object('type','guess','word',word));
 outcome:=public.delayed_five_alive_commit(child,actor,req,c.revision,c.segment,fp,g,win);PERFORM pg_temp.fa_assert(outcome->>'outcome'='committed','legal reducer transition');
 RETURN jsonb_build_object('child',child,'actor',actor,'request',req,'revision',c.revision,'segment',c.segment,'fingerprint',fp,'game',g,'winner',win);
END$$;
CREATE FUNCTION pg_temp.fa_replay(command jsonb) RETURNS void LANGUAGE plpgsql AS $$DECLARE result jsonb;BEGIN
 result:=public.delayed_five_alive_commit((command->>'child')::uuid,(command->>'actor')::uuid,(command->>'request')::uuid,(command->>'revision')::bigint,(command->>'segment')::bigint,command->'fingerprint',command->'game',(command->>'winner')::uuid);
 PERFORM pg_temp.fa_assert(result->>'outcome'='duplicate','duplicate or late command replay');
END$$;
CREATE FUNCTION pg_temp.fa_verify(m uuid,real_i boolean,expected int) RETURNS void LANGUAGE plpgsql AS $$DECLARE receipt private.delayed_settlements;a uuid;b uuid;BEGIN
 SELECT x.a,x.b INTO a,b FROM fa_actors x;SET CONSTRAINTS ALL IMMEDIATE;
 SELECT * INTO STRICT receipt FROM private.delayed_settlements WHERE match_id=m;
 PERFORM pg_temp.fa_assert(receipt.organizer_delta=expected AND receipt.opponent_delta=-expected,'exact settlement');
 PERFORM pg_temp.fa_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.players WHERE game_id=m),'canonical player chips');
 PERFORM pg_temp.fa_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.session_player_snapshots WHERE game_id=m),'canonical snapshots');
 PERFORM pg_temp.fa_assert((SELECT count(*)=CASE WHEN real_i THEN 2 ELSE 0 END AND coalesce(bool_and(amount=CASE WHEN profile_id=a THEN expected ELSE -expected END),true) FROM public.player_transactions WHERE source_game_id=m AND transaction_type='SessionResult'),'canonical account postings');
 PERFORM pg_temp.fa_assert((SELECT count(*)=CASE WHEN expected=0 THEN 0 ELSE 1 END AND coalesce(bool_and(unmatched_deltas='{}'::jsonb AND jsonb_array_length(transfers)=1 AND (transfers->0->>'amount')::numeric=abs(expected)),true) FROM public.gameplay_transfer_batches WHERE game_id=m),'balanced canonical transfers');
 PERFORM pg_temp.fa_assert((SELECT count(*)=1 FROM public.game_results WHERE game_id=m AND id=receipt.result_id),'one result');
 PERFORM pg_temp.fa_assert((SELECT status='session_ended' FROM public.games WHERE id=m) AND (SELECT status='settled' FROM private.delayed_matches WHERE id=m),'terminal lifecycle');
 PERFORM pg_temp.fa_assert(private.delayed_finalize(m)=to_jsonb(receipt),'settlement replay');SET CONSTRAINTS ALL DEFERRED;
END$$;

CREATE FUNCTION pg_temp.fa_privacy(m uuid,child uuid,actor uuid) RETURNS void LANGUAGE plpgsql AS $$DECLARE record jsonb;canonical jsonb;viewer int;opponent int;r jsonb;rr jsonb;guess jsonb;outsider uuid;BEGIN
 SELECT state->'fiveAlive' INTO canonical FROM private.delayed_children WHERE id=child;
 viewer:=CASE WHEN canonical->'players'->>0=actor::text THEN 0 ELSE 1 END;opponent:=1-viewer;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);record:=public.delayed_match_record(m,child);
 PERFORM pg_temp.fa_assert(record#>ARRAY['detail','words','rounds',viewer::text]=canonical->'rounds'->viewer,'own history is intact');
 FOR i IN 0..2 LOOP
  r:=canonical->'rounds'->opponent->i;rr:=record#>ARRAY['detail','words','rounds',opponent::text,i::text];
  PERFORM pg_temp.fa_assert((rr-'guesses')=(r-'guesses') AND jsonb_array_length(rr->'guesses')=jsonb_array_length(r->'guesses'),'round metadata and guess count intact');
  FOR j IN 0..jsonb_array_length(r->'guesses')-1 LOOP
   guess:=r->'guesses'->j;
   PERFORM pg_temp.fa_assert(rr->'guesses'->j=CASE WHEN j=jsonb_array_length(r->'guesses')-1 AND guess->>'word'=r->>'answer' THEN guess ELSE '{"word":"","feedback":[]}'::jsonb END,'opponent only final correct guess visible');
  END LOOP;
 END LOOP;
 SELECT x.outsider INTO outsider FROM fa_actors x;PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 BEGIN PERFORM public.delayed_match_record(m,child);RAISE EXCEPTION 'privacy:unauthorized history';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.delayed_match_record(m,child);RAISE EXCEPTION 'privacy:anonymous history';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
CREATE FUNCTION pg_temp.fa_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.match_id::text=current_setting('fa.fail',true) THEN RAISE EXCEPTION 'fa:injected_after_finance';END IF;RETURN NEW;END$$;
CREATE TRIGGER fa_failure BEFORE INSERT ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION pg_temp.fa_fail();
DO $$DECLARE real_i boolean;kind text;m uuid;child uuid;a uuid;b uuid;outsider uuid;answers jsonb;word text;wrong text;command jsonb;prior jsonb;before_next jsonb;expected int;successor uuid;BEGIN
 SELECT x.a,x.b,x.outsider INTO a,b,outsider FROM fa_actors x;
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
  FOREACH kind IN ARRAY ARRAY['winner','tie','injected-rollback','continuation','failed'] LOOP
   m:=pg_temp.fa_fixture(real_i,CASE WHEN kind='continuation' THEN 2 ELSE 1 END);
   FOR child IN SELECT id FROM private.delayed_children WHERE match_id=m ORDER BY ordinal LOOP
    SELECT state->'fiveAlive'->'answers' INTO answers FROM private.delayed_children WHERE id=child;
    BEGIN PERFORM public.delayed_five_alive_review_load(child,outsider,NULL);RAISE EXCEPTION 'relative_proof:authorization';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    FOR i IN 0..2 LOOP
     word:=answers->i->>'word';wrong:=CASE WHEN word='STONE' THEN 'BREAD' ELSE 'STONE' END;
     PERFORM pg_temp.fa_guess(child,a,word);IF kind<>'tie' THEN PERFORM pg_temp.fa_guess(child,b,wrong);END IF;
     IF kind='injected-rollback' AND i=2 THEN
      PERFORM set_config('fa.fail',m::text,true);
      BEGIN PERFORM pg_temp.fa_guess(child,b,word);RAISE EXCEPTION 'relative_proof:missing_failure';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'fa:injected_after_finance' THEN RAISE;END IF;END;
      PERFORM pg_temp.fa_assert(NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m) AND NOT EXISTS(SELECT FROM public.games WHERE id=m) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=m) AND NOT EXISTS(SELECT FROM private.delayed_outcomes WHERE match_id=m),'atomic failure rollback');
      PERFORM set_config('fa.fail','',true);
     END IF;
     IF kind='failed' THEN FOR miss IN 2..5 LOOP PERFORM pg_temp.fa_guess(child,b,wrong);END LOOP;END IF;command:=pg_temp.fa_guess(child,b,CASE WHEN kind='failed' THEN wrong ELSE word END);PERFORM pg_temp.fa_replay(command);
    END LOOP;
    SELECT id,state INTO successor,before_next FROM private.delayed_children WHERE match_id=m AND ordinal>(SELECT ordinal FROM private.delayed_children WHERE id=child) ORDER BY ordinal LIMIT 1;
    IF successor IS NOT NULL THEN PERFORM pg_temp.fa_assert(NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m),'no early continuation settlement');PERFORM pg_temp.fa_replay(command);PERFORM pg_temp.fa_assert((SELECT state=before_next FROM private.delayed_children WHERE id=successor),'late replay preserves successor');END IF;
   END LOOP;
   expected:=CASE WHEN kind='tie' THEN 0 WHEN kind='continuation' THEN 14 ELSE 7 END;
   PERFORM pg_temp.fa_verify(m,real_i,expected);FOR child IN SELECT id FROM private.delayed_children WHERE match_id=m LOOP PERFORM pg_temp.fa_privacy(m,child,a);PERFORM pg_temp.fa_privacy(m,child,b);END LOOP;
   PERFORM pg_temp.fa_assert((SELECT count(*)=CASE WHEN kind='continuation' THEN 2 ELSE 1 END FROM private.delayed_outcomes WHERE match_id=m),'immutable child outcomes');
   PERFORM pg_temp.fa_replay(command);
  END LOOP;
 END LOOP;
END$$;
SELECT jsonb_build_object('status','PASS','financial_modes',jsonb_build_array('fake','real'),'cases',jsonb_build_array('winner','tie','six_misses','own_history','opponent_privacy','duplicate','late_replay','authorization','atomic_rollback','continuation','terminal','stake_7')) proof;
ROLLBACK;
