-- Deliberately constructed terminal fixtures qualify the canonical settlement
-- boundary independently of random deals. Core/full-match proofs cover earning it.
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[];
 g uuid;d uuid;r uuid;offer timestamptz;v jsonb;s jsonb;totals jsonb;people jsonb;changes jsonb;expected jsonb;
 n integer;k integer;i integer;money_i integer;amount integer;win_ids uuid[];failed boolean;
BEGIN
 FOR i IN 1..4 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Golf finance '||users[i]::text,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOR money_i IN 0..1 LOOP
  FOR n IN 2..4 LOOP
   FOR k IN 1..n LOOP
    g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
    INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
     VALUES(g,'game_selection',money_i=1,4,offer,0,false,k=n);
    -- Pending session end is requested after admission, not before stake consent.
    UPDATE public.games SET pending_session_end=false WHERE id=g;
    INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[x],g,users[x],5-x,100,false FROM generate_series(1,n)x;
    PERFORM pg_temp.golf_login(users[1]);
    PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
    v:=public.golf_configure(g,ids[1],4,'six-card-golf','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
    FOR i IN 2..n LOOP PERFORM pg_temp.golf_login(users[i]);PERFORM public.submit_ante_decision(g,d,ids[i],'ante_up');END LOOP;
    SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;
    SELECT jsonb_object_agg(ids[x]::text,CASE WHEN x<=k THEN -4 ELSE 12 END),array_agg(ids[x]) FILTER(WHERE x<=k)
     INTO totals,win_ids FROM generate_series(1,n)x;
    -- A fixture completes nine scored holes with exact public totals.
    s:=s||jsonb_build_object('phase','complete','hole',9,'scores',totals,'pending',NULL,'holes',
      (SELECT jsonb_agg(jsonb_build_object('hole',h,'scores',CASE WHEN h=9 THEN totals ELSE (SELECT jsonb_object_agg(ids[x]::text,0) FROM generate_series(1,n)x) END)) FROM generate_series(1,9)h));
    FOR i IN 1..n LOOP s:=jsonb_set(s,ARRAY['tableaus',ids[i]::text,'exposed'],'[true,true,true,true,true,true]');END LOOP;
    UPDATE private.golf_matches SET state=s,revision=revision+1 WHERE dealer_game_id=d;
    expected:=private.split_whole_chips_clockwise(g,win_ids,(n-k)*5,4);
    FOR i IN k+1..n LOOP expected:=expected||jsonb_build_object(ids[i]::text,-5);END LOOP;
    -- Inject a failure after the real player updates and ledger write.
    IF k=1 THEN
     CREATE OR REPLACE FUNCTION pg_temp.golf_fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $f$
     BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'injection_before_chips';END IF;
      RAISE EXCEPTION 'golf_injected_after_chips';
     END $f$;
     CREATE TRIGGER golf_proof_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.golf_fail_snapshot();
     failed:=false;
     BEGIN PERFORM private.golf_settle(d);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf_injected_after_chips' THEN RAISE;END IF;failed:=true;END;
     DROP TRIGGER golf_proof_failure ON public.session_player_snapshots;
     PERFORM pg_temp.golf_assert(failed AND (SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),'financial failure restores actual chips');
     PERFORM pg_temp.golf_assert(NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=d)
      AND NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d)
      AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE dealer_game_id=d)
      AND (SELECT settlement IS NULL FROM private.golf_matches WHERE dealer_game_id=d),'failure rolls back complete financial boundary');
    END IF;
    UPDATE public.games SET pending_session_end=k=n WHERE id=g;
    PERFORM private.golf_settle(d);PERFORM private.golf_settle(d);
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT settlement INTO changes FROM private.golf_matches WHERE dealer_game_id=d;
    PERFORM pg_temp.golf_assert(changes=expected,'all co-winner counts use canonical remainder');
    PERFORM pg_temp.golf_assert((SELECT bool_and(p.chips=100+(expected->>p.id::text)::integer) AND sum(p.chips)=n*100 FROM public.players p WHERE game_id=g),'tie exact balances');
    PERFORM pg_temp.golf_assert((SELECT count(*)=1 AND bool_and(player_chip_changes=expected) FROM public.game_results WHERE dealer_game_id=d),'immutable shared result');
    IF k=n THEN
     PERFORM pg_temp.golf_assert(NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d)
      AND (SELECT status='session_ended' FROM public.games WHERE id=g),'all tie zero movement and terminal disposition');
    ELSE
     PERFORM pg_temp.golf_assert((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'single balanced journal');
    END IF;
    SET CONSTRAINTS ALL DEFERRED;
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
SELECT 'Golf every winner count 2–4 seats / both money modes, exact canonical remainder, all ties, after-chip rollback passed' proof;
