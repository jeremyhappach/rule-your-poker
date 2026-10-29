-- Run after the existing scoped Words/polish proof, inside BEGIN/ROLLBACK.
-- All identities are synthetic. Never invoke a global recovery sweep here.
CREATE FUNCTION pg_temp.ac_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.id::text=current_setting('ac.fail',true) AND NEW.status='session_ended'
 THEN RAISE EXCEPTION 'ac:injected';END IF;RETURN NEW;END $$;
CREATE TRIGGER ac_proof_failure BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.ac_fail();
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();bot uuid:=gen_random_uuid();
 p uuid;z uuid;id_i uuid;r uuid;hash_i text;offer_i jsonb;answer jsonb;prior jsonb;home_i jsonb;
 c private.delayed_children;due_i timestamptz;at_i bigint;i integer;net_i bigint;status_i text;board_i jsonb;visible_i jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Combined proof '||a,true),(b,'Combined proof '||b,true),(outsider,'Combined proof '||outsider,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(bot,'Combined bot '||bot,true);
 UPDATE private.delayed_release SET admission_enabled=true;
 UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 offer_i:='[{"game":"ptown-words","stake":5},{"game":"run21","stake":6},{"game":"tri-towers","stake":7},{"game":"quintzee","stake":8},{"game":"boxdrop","stake":9}]';
 PERFORM pg_temp.aw_assert(public.delayed_capabilities()->>'max_children'='1','combined admission initially closed');
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,offer_i);RAISE EXCEPTION 'ac:accepted closed lineup';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='ac:accepted closed lineup' THEN RAISE;END IF;END;
 UPDATE private.delayed_recovery_state SET enabled=true;
 PERFORM pg_temp.aw_assert(jsonb_array_length(public.delayed_capabilities()->'games')=5 AND public.delayed_capabilities()->>'max_children'='32','five-game capability and ceiling');
 PERFORM pg_temp.aw_assert(NOT private.delayed_human(bot),'profile-only bot is ineligible');
 PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.delayed_opponent_page('Combined bot '||bot,'username')->'items') x WHERE x->>'id'=bot::text),'bot absent from discovery');
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),bot,false,offer_i);RAISE EXCEPTION 'ac:accepted bot';
 EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM='ac:accepted bot' THEN RAISE;END IF;END;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,true,offer_i);RAISE EXCEPTION 'ac:accepted real money';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='ac:accepted real money' THEN RAISE;END IF;END;
 SELECT jsonb_agg(jsonb_build_object('game','ptown-words','stake',1)) INTO answer FROM generate_series(1,33);
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,answer);RAISE EXCEPTION 'ac:accepted 33';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='ac:accepted 33' THEN RAISE;END IF;END;
 PERFORM public.delayed_create(gen_random_uuid(),b,false,answer-32);
 r:=gen_random_uuid();p:=public.delayed_create(r,b,false,offer_i);
 PERFORM pg_temp.aw_assert(public.delayed_create(r,b,false,offer_i)=p,'create replay');
 home_i:=public.delayed_home(p);hash_i:=home_i->>'offerHash';
 PERFORM pg_temp.aw_assert(home_i->>'exposure'='35' AND (SELECT jsonb_agg(x->>'game' ORDER BY n) FROM jsonb_array_elements(home_i->'lineup') WITH ORDINALITY t(x,n))='["ptown-words","run21","tri-towers","quintzee","boxdrop"]','lineup order and individual exposure');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);r:=gen_random_uuid();
 answer:=public.delayed_respond(p,r,hash_i,'accept');
 PERFORM pg_temp.aw_assert(public.delayed_respond(p,r,hash_i,'accept')=answer,'accept replay');
 PERFORM pg_temp.aw_assert((SELECT count(*)=5 AND bool_and(starter IN(a,b) AND actor=starter AND expires_at=available_at+interval '36 hours' AND last_call_at=available_at+interval '24 hours') FROM private.delayed_children WHERE match_id=p),'all children independently available with frozen starters and deadlines');
 PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.games WHERE id=p) AND NOT EXISTS(SELECT FROM public.players WHERE game_id=p) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=p),'acceptance has zero financial writes');
 SELECT * INTO c FROM private.delayed_children WHERE match_id=p AND game_type='ptown-words';
 FOR i IN 1..4 LOOP
  SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
  PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);
  PERFORM public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'pass',NULL);
 END LOOP;
 PERFORM pg_temp.aw_assert((SELECT count(*)=1 FROM private.delayed_outcomes WHERE match_id=p) AND NOT EXISTS(SELECT FROM public.games WHERE id=p),'normal Words completion remains provisional');
 FOR c IN SELECT * FROM private.delayed_children WHERE match_id=p AND game_type<>'ptown-words' ORDER BY ordinal LOOP
  at_i:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF c.game_type='tri-towers' THEN
   board_i:=public.delayed_tri_core('deal',c.config,0,NULL,NULL,NULL,at_i);
   visible_i:=public.delayed_tri_core('visible',c.config,0,board_i);
   FOR i IN 1..4 LOOP
    EXIT WHEN board_i->>'phase'='stage_complete';
    board_i:=public.delayed_tri_core('reduce',c.config,0,board_i,'tick',NULL,(board_i->>'deadline')::bigint);
   END LOOP;
   PERFORM pg_temp.aw_assert(board_i->>'phase'='stage_complete' AND board_i->'result' IS NOT NULL AND NOT visible_i?'deck','shared TriTowers deadline result and private deck');
  ELSIF c.game_type IN('quintzee','boxdrop') THEN
   board_i:=public.delayed_board_core(c.game_type,'deal',c.config,0,NULL,NULL,NULL,at_i);
   visible_i:=public.delayed_board_core(c.game_type,'visible',c.config,0,board_i);
   FOR i IN 1..4 LOOP
    EXIT WHEN board_i->>'phase'='stage_complete';
    board_i:=public.delayed_board_core(c.game_type,'reduce',c.config,0,board_i,'tick',NULL,(board_i->>'deadline')::bigint);
   END LOOP;
   PERFORM pg_temp.aw_assert(board_i->>'phase'='stage_complete' AND board_i->'result' IS NOT NULL AND NOT visible_i?'deck','shared '||c.game_type||' deadline result and private deck');
   PERFORM pg_temp.aw_assert(public.delayed_board_core(c.game_type,'rounds',NULL,CASE WHEN c.game_type='quintzee' THEN 79999 ELSE 99999 END)='2'::jsonb AND public.delayed_board_core(c.game_type,'rounds',NULL,CASE WHEN c.game_type='quintzee' THEN 80000 ELSE 100000 END)='3'::jsonb,'shared bonus boundary');
  END IF;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  BEGIN PERFORM public.delayed_words_snapshot(c.id);RAISE EXCEPTION 'ac:wrong adapter admitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='ac:wrong adapter admitted' THEN RAISE;END IF;END;
  due_i:=date_trunc('milliseconds',clock_timestamp())-interval '1 second';
  UPDATE private.delayed_children SET available_at=due_i-interval '36 hours',last_call_at=due_i-interval '12 hours',expires_at=due_i WHERE id=c.id RETURNING * INTO c;
  at_i:=floor(extract(epoch FROM c.expires_at)*1000)::bigint;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.delayed_commit(c.id,a,c.revision,NULL,'tick',at_i,false);RAISE EXCEPTION 'ac:browser committed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  answer:=public.delayed_commit(c.id,NULL,c.revision-1,NULL,'tick',at_i,false);
  RESET ROLE;
  PERFORM pg_temp.aw_assert(answer->>'outcome'='conflict','stale revision has no effects');
  IF c.ordinal=5 THEN
   PERFORM set_config('ac.fail',p::text,true);
   BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.delayed_commit(c.id,NULL,c.revision,NULL,'tick',at_i,false);
    RESET ROLE;RAISE EXCEPTION 'ac:missing injected failure';
   EXCEPTION WHEN raise_exception THEN RESET ROLE;IF SQLERRM<>'ac:injected' THEN RAISE;END IF;END;
   PERFORM pg_temp.aw_assert((SELECT count(*)=4 FROM private.delayed_outcomes WHERE match_id=p) AND NOT EXISTS(SELECT FROM public.games WHERE id=p) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=p),'last child, chips, ledger, snapshots and receipt roll back together');
   PERFORM set_config('ac.fail','',true);
  END IF;
  SET LOCAL ROLE service_role;
  answer:=public.delayed_commit(c.id,NULL,c.revision,NULL,'tick',at_i,false);
  prior:=public.delayed_commit(c.id,NULL,c.revision,NULL,'tick',at_i,false);
  RESET ROLE;
  PERFORM pg_temp.aw_assert(answer->>'outcome'='committed' AND prior->>'outcome'='conflict','deadline commit and late replay');
  IF c.ordinal<5 THEN PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.games WHERE id=p),'interim forfeits do not settle');END IF;
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT sum(organizer_delta) INTO net_i FROM private.delayed_outcomes WHERE match_id=p;
 PERFORM pg_temp.aw_assert((SELECT count(*)=5 AND sum(organizer_delta+opponent_delta)=0 FROM private.delayed_outcomes WHERE match_id=p),'five immutable zero-sum signed outcomes');
 PERFORM pg_temp.aw_assert((SELECT count(*)=4 FROM private.delayed_outcomes WHERE match_id=p AND reason='timeout_forfeit'),'individual child forfeiture history');
 PERFORM pg_temp.aw_assert((SELECT count(*)=1 FROM private.delayed_settlements WHERE match_id=p AND organizer_delta=net_i AND opponent_delta=-net_i),'one aggregate receipt');
 PERFORM pg_temp.aw_assert((SELECT count(*)=2 AND sum(chips)=0 AND sum(abs(chips))=2*abs(net_i) FROM public.players WHERE game_id=p),'actual canonical positive/negative chips');
 PERFORM pg_temp.aw_assert((SELECT count(*)=2 AND sum(chips)=0 FROM public.session_player_snapshots WHERE game_id=p),'atomic final snapshots');
 PERFORM pg_temp.aw_assert((SELECT count(*)=CASE WHEN net_i=0 THEN 0 ELSE 1 END FROM public.gameplay_transfer_batches WHERE game_id=p) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=p AND unmatched_deltas<>'{}'::jsonb),'one balanced aggregate transfer or none at zero');
 PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=p),'fake settlement does not write real accounts');
 prior:=private.delayed_finalize(p);PERFORM pg_temp.aw_assert(private.delayed_finalize(p)=prior,'parent receipt replay');
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 BEGIN PERFORM public.delayed_remove(p,gen_random_uuid());RAISE EXCEPTION 'ac:outsider deleted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 BEGIN PERFORM public.delayed_remove(p,gen_random_uuid());RAISE EXCEPTION 'ac:opponent deleted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);r:=gen_random_uuid();
 answer:=public.delayed_remove(p,r);PERFORM pg_temp.aw_assert(public.delayed_remove(p,r)=answer,'removal replay');
 PERFORM pg_temp.aw_assert(private.delayed_finalize(p)=prior AND (SELECT count(*)=5 FROM private.delayed_outcomes WHERE match_id=p),'settlement-first removal preserves all history and creates no new payout');
 FOREACH id_i IN ARRAY ARRAY[a,b] LOOP
  PERFORM set_config('request.jwt.claim.sub',id_i::text,true);
  PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.delayed_list()) v WHERE v->>'id'=p::text),'removed match hidden for each player');
  PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') v WHERE v->>'matchId'=p::text),'removed notice hidden for each player');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOREACH status_i IN ARRAY ARRAY['invited','active','declined','cancelled','expired'] LOOP
  z:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":3}]');
  IF status_i='active' THEN
   SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=z;
   PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(z,gen_random_uuid(),hash_i,'accept');
   PERFORM set_config('request.jwt.claim.sub',a::text,true);
  ELSE UPDATE private.delayed_matches SET status=status_i WHERE id=z;END IF;
  PERFORM public.delayed_remove(z,gen_random_uuid());
  PERFORM pg_temp.aw_assert(EXISTS(SELECT FROM private.delayed_removals WHERE match_id=z) AND NOT EXISTS(SELECT FROM public.games WHERE id=z) AND NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=z),'removal at '||status_i||' creates no settlement');
  IF status_i='active' THEN
   SELECT * INTO c FROM private.delayed_children WHERE match_id=z;
   BEGIN PERFORM private.delayed_record_outcome(c.id,c.revision,'normal',a,'{}');RAISE EXCEPTION 'ac:deleted match settled';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM='ac:deleted match settled' THEN RAISE;END IF;END;
  END IF;
 END LOOP;
 z:=gen_random_uuid();offer_i:=jsonb_build_array(jsonb_build_object('game','ptown-words','stake',3,'config',private.ptown_words_rules_for('ptown-words/3')));
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash)
 VALUES(z,a,b,true,'invited',offer_i,md5(offer_i::text));
 BEGIN PERFORM public.delayed_remove(z,gen_random_uuid());RAISE EXCEPTION 'ac:real match deleted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.aw_assert(NOT has_function_privilege('authenticated','public.delayed_board_core(text,text,jsonb,bigint,jsonb,text,integer[],bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.delayed_remove(uuid,uuid)','EXECUTE'),'trusted core and removal privileges');
END $$;
DROP TRIGGER ac_proof_failure ON public.games;
SELECT 'PASS five-game admission, human identity, shared SQL rule cores/privacy/deadlines, parent-only canonical settlement, negative chips, deferred balanced ledger, atomic rollback/retry, six removal statuses and service boundary' proof;
