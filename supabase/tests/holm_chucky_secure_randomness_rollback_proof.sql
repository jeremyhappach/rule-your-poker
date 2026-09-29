-- Assembled inside the settlement-boundary rollback transaction by
-- build-holm-chucky-proof.mjs. All real-money-tagged sessions below are synthetic
-- and rolled back; no historical sessions or account balances are rewritten.
-- Keep the old MD5 algorithm only as an explicit test oracle.
CREATE OR REPLACE FUNCTION pg_temp.old_md5_chucky_cards(p_round_id uuid, p_used_cards jsonb, p_card_count integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH deck AS (
    SELECT suit, rank
    FROM unnest(ARRAY[chr(9827), chr(9830), chr(9829), chr(9824)]) AS suits(suit)
    CROSS JOIN unnest(ARRAY['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) AS ranks(rank)
  ), available AS (
    SELECT
      jsonb_build_object('suit', suit, 'rank', rank) AS card,
      md5(p_round_id::text || ':holm-chucky:' || suit || ':' || rank) AS shuffle_key
    FROM deck
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_used_cards, '[]'::jsonb)) AS used(card)
      WHERE lower(coalesce(used.card->>'suit', used.card->>'Suit')) = deck.suit
        AND upper(coalesce(used.card->>'rank', used.card->>'Rank')) = upper(deck.rank)
    )
    ORDER BY shuffle_key
    LIMIT p_card_count
  )
  SELECT coalesce(jsonb_agg(card ORDER BY shuffle_key), '[]'::jsonb)
  FROM available;
$function$
;

CREATE TEMP TABLE chucky_entropy_results(kind text, round_id uuid, cards jsonb, old_match boolean);
DO $entropy_proof$
DECLARE f jsonb; g uuid; r uuid; p1 uuid; p2 uuid; board jsonb; used_cards jsonb;
 actual jsonb; observed jsonb; old_cards jsonb; result jsonb; before_replay jsonb;
 i integer; actor integer; reload integer; fixed_id uuid:=gen_random_uuid();
 body text; denied boolean;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.holm_deterministic_chucky_cards(uuid,jsonb,integer)'::regprocedure;
 IF body ~* 'md5|digest|p_round_id|random\s*\(|auth\.|player|balance|wager|history|harness'
    OR body NOT LIKE '%private.secure_shuffle_key()%'
    OR (SELECT provolatile FROM pg_proc WHERE oid='public.holm_deterministic_chucky_cards(uuid,jsonb,integer)'::regprocedure)<>'v'
    OR has_function_privilege('authenticated','private.secure_shuffle_key()','EXECUTE')
    OR has_function_privilege('anon','private.secure_shuffle_key()','EXECUTE') THEN
   RAISE EXCEPTION 'chucky_entropy:source_or_entropy_boundary';
 END IF;
 -- Exactly the same ID, available deck and card count still produce fresh entropy.
 FOR i IN 1..32 LOOP
   actual:=public.holm_deterministic_chucky_cards(fixed_id,'[]',4);
   INSERT INTO chucky_entropy_results VALUES('same-id',fixed_id,actual,
     actual=pg_temp.old_md5_chucky_cards(fixed_id,'[]',4));
 END LOOP;
 IF (SELECT count(DISTINCT cards) FROM chucky_entropy_results WHERE kind='same-id')<28 THEN
   RAISE EXCEPTION 'chucky_entropy:repeated_id_determinism';
 END IF;
 -- 32 identical-input rounds per authoritative caller; only fresh identities vary.
 FOR i IN 1..64 LOOP
   f:=pg_temp.holm_boundary_fixture('crypto draw '||i,i>32,true,true);
   g:=(f->>'game')::uuid; r:=(f->>'round')::uuid;
   p1:=(f->>'p1')::uuid; p2:=(f->>'p2')::uuid;
   UPDATE public.games SET real_money=true WHERE id=g;
   SELECT community_cards INTO board FROM private.holm_round_cards WHERE round_id=r;
   SELECT coalesce(jsonb_agg(c.card),'[]'::jsonb)||board INTO used_cards
     FROM public.player_cards pc CROSS JOIN LATERAL jsonb_array_elements(pc.cards) c(card) WHERE pc.round_id=r;
   old_cards:=pg_temp.old_md5_chucky_cards(r,used_cards,4);
   FOR actor IN 1..2 LOOP
     PERFORM set_config('request.jwt.claim.sub',f->>('u'||actor),true);
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>('u'||actor),'role','authenticated')::text,true);
     EXECUTE 'SET LOCAL ROLE authenticated';
     result:=public.holm_submit_decision(g,r,(f->>('p'||actor))::uuid,
       CASE WHEN actor=2 AND i<=32 THEN 'fold' ELSE 'stay' END);
     EXECUTE 'RESET ROLE';
   END LOOP;
   SELECT chucky_cards INTO actual FROM private.holm_round_cards WHERE round_id=r;
   PERFORM private.assert_holm_round_card_integrity(r);
   IF jsonb_array_length(actual)<>4 OR (SELECT status FROM public.rounds WHERE id=r)<>'completed'
      OR (SELECT count(*) FROM public.game_results WHERE game_id=g AND hand_number=1)<>1
      OR (SELECT sum(chips) FROM public.players WHERE game_id=g)+(SELECT pot FROM public.games WHERE id=g)<>200 THEN
     RAISE EXCEPTION 'chucky_entropy:draw_or_settlement:%:%',i,result;
   END IF;
   INSERT INTO chucky_entropy_results VALUES(CASE WHEN i<=32 THEN 'solo' ELSE 'tied-showdown' END,r,actual,actual=old_cards);
   -- Fresh canonical frame reads represent reload/reconnect for both participants.
   FOR actor IN 1..2 LOOP
     PERFORM set_config('request.jwt.claim.sub',f->>('u'||actor),true);
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>('u'||actor),'role','authenticated')::text,true);
     FOR reload IN 1..2 LOOP
       EXECUTE 'SET LOCAL ROLE authenticated';
       result:=public.read_session_frame(g);
       EXECUTE 'RESET ROLE';
       SELECT value->'chucky_cards' INTO observed FROM jsonb_array_elements(result#>'{game,rounds}') WHERE value->>'id'=r::text;
       IF observed IS DISTINCT FROM actual THEN RAISE EXCEPTION 'chucky_entropy:frame_changed:%:%',i,actor; END IF;
     END LOOP;
   END LOOP;
   before_replay:=pg_temp.holm_boundary_snapshot(g);
   result:=public.holm_submit_decision(g,r,p2,CASE WHEN i<=32 THEN 'fold' ELSE 'stay' END);
   result:=public.resolve_holm_showdown(g,r);
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   EXECUTE 'SET LOCAL ROLE service_role';
   result:=public.recover_pending_holm_showdowns(g);
   EXECUTE 'RESET ROLE';
   IF (SELECT chucky_cards FROM private.holm_round_cards WHERE round_id=r) IS DISTINCT FROM actual
      OR pg_temp.holm_boundary_snapshot(g) IS DISTINCT FROM before_replay THEN
     RAISE EXCEPTION 'chucky_entropy:replay_or_recovery_changed:%',i;
   END IF;
   -- Even a privileged accidental rewrite cannot replace committed cards.
   denied:=false;
   BEGIN
     UPDATE public.rounds SET chucky_cards='[]'::jsonb WHERE id=r;
   EXCEPTION WHEN OTHERS THEN denied:=SQLERRM LIKE '%chucky_already_committed%'; END;
   IF NOT denied THEN RAISE EXCEPTION 'chucky_entropy:committed_cards_replaceable'; END IF;
 END LOOP;
 -- A chance match is possible for a fair draw; consistent reproduction is not.
 IF (SELECT count(*) FROM chucky_entropy_results WHERE kind<>'same-id' AND old_match)>1 THEN
   RAISE EXCEPTION 'chucky_entropy:old_algorithm_relationship';
 END IF;
END;
$entropy_proof$;

-- Global harness settings are uncommitted transaction-local changes. A real-money
-- session must ignore them while explicit fake-money harness behavior still works.
DO $isolation_proof$
DECLARE f jsonb; g uuid; r uuid; result jsonb; mode boolean; actor integer; actual text;
BEGIN
 UPDATE public.system_settings SET value=jsonb_set(value,'{enabled}','true'::jsonb) WHERE key='harnesses_mode';
 UPDATE public.game_defaults SET debug_harness='force_player_beats_chucky' WHERE game_type='holm';
 FOREACH mode IN ARRAY ARRAY[true,false] LOOP
   f:=pg_temp.holm_boundary_fixture('fixed harness isolation '||mode,false,true);
   g:=(f->>'game')::uuid; r:=(f->>'round')::uuid;
   UPDATE public.games SET real_money=mode WHERE id=g;
   FOR actor IN 1..2 LOOP
     PERFORM set_config('request.jwt.claim.sub',f->>('u'||actor),true);
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>('u'||actor),'role','authenticated')::text,true);
     EXECUTE 'SET LOCAL ROLE authenticated';
     result:=public.holm_submit_decision(g,r,(f->>('p'||actor))::uuid,CASE WHEN actor=2 THEN 'fold' ELSE 'stay' END);
     EXECUTE 'RESET ROLE';
   END LOOP;
   SELECT event_kind::text INTO actual FROM public.game_results WHERE game_id=g AND event_kind IS NOT NULL;
   IF actual IS DISTINCT FROM (CASE WHEN mode THEN 'chucky_loss_pot_match' ELSE 'chucky_final_award' END) THEN
     RAISE EXCEPTION 'chucky_entropy:harness_leaked:%:%:%',mode,actual,result;
   END IF;
 END LOOP;
END;
$isolation_proof$;

-- A valid admin request works for a fake table, but cannot be armed for real
-- money or consumed after a synthetic table changes from fake to real money.
DO $target_isolation$
DECLARE f jsonb; g uuid; d uuid; admin_id uuid; result jsonb; profile text;
BEGIN
 SELECT id INTO admin_id FROM public.profiles WHERE public.has_role(id,'admin')
   AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=profiles.id) ORDER BY id LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'chucky_entropy:admin_fixture_required'; END IF;
 f:=pg_temp.holm_boundary_fixture('target isolation',false,false,true);
 g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid;
 -- Only this synthetic round is removed to restore the setup phase.
 DELETE FROM public.player_cards WHERE round_id=(f->>'round')::uuid;
 DELETE FROM public.rounds WHERE id=(f->>'round')::uuid;
 UPDATE public.games SET status='ante_decision',current_host=admin_id,real_money=false WHERE id=g;
 INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot)
 VALUES(g,admin_id,4,0,'active',false,false);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.arm_target_rule_branch_harness(g,'holm:solo:loss',600);
 EXECUTE 'RESET ROLE';
 IF result->>'outcome'<>'armed' THEN RAISE EXCEPTION 'chucky_entropy:fake_arm_failed:%',result; END IF;
 profile:=private.target_rule_branch_profile_for_context(g,d,1,1,'holm-game');
 IF profile IS DISTINCT FROM 'holm:solo:loss' OR private.target_holm_fixture_chucky(profile,4) IS NULL THEN
   RAISE EXCEPTION 'chucky_entropy:fake_fixture_lost';
 END IF;
 UPDATE public.games SET real_money=true WHERE id=g;
 IF private.target_rule_branch_profile_for_context(g,d,1,1,'holm-game') IS NOT NULL THEN
   RAISE EXCEPTION 'chucky_entropy:stale_fixture_consumed_for_real_money';
 END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.arm_target_rule_branch_harness(g,'holm:solo:loss',600);
 EXECUTE 'RESET ROLE';
 IF result->>'outcome'<>'real_money_forbidden' THEN RAISE EXCEPTION 'chucky_entropy:real_arm_allowed:%',result; END IF;
END;
$target_isolation$;

SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'passed' AS status, kind, count(*) AS examined, count(DISTINCT cards) AS distinct_cards,
 count(*) FILTER (WHERE old_match) AS old_md5_matches FROM chucky_entropy_results GROUP BY kind ORDER BY kind;
ROLLBACK;
