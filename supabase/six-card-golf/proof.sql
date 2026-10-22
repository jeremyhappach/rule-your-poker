CREATE OR REPLACE FUNCTION pg_temp.golf_login(actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; ids uuid[];
 game uuid; dealer uuid; deadline timestamptz; v jsonb; s jsonb; m private.golf_matches; prior jsonb; req uuid; round_i uuid; rev bigint; action text; items integer[]; actor_i integer;
 n integer; money_i integer; i integer; turn_i integer; winners integer; chips_before jsonb; result_count integer;
BEGIN
 UPDATE private.golf_release SET enabled=true,admission_enabled=true;
 FOR i IN 1..4 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Golf proof '||users[i]::text,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOR money_i IN 0..1 LOOP
  FOR n IN 2..4 LOOP
   game:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
   deadline:=clock_timestamp()+interval '30 minutes';
   INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
    VALUES(game,'game_selection',money_i=1,4,deadline,0,false,false);
   INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot)
    SELECT ids[x],game,users[x],5-x,100,false FROM generate_series(1,n)x;
   PERFORM pg_temp.golf_login(users[1]);
   PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
   v:=public.golf_configure(game,ids[1],4,'six-card-golf','{"ante_amount":5}',deadline);
   dealer:=(v#>>'{dealer_game,id}')::uuid;
   PERFORM pg_temp.golf_assert((public.golf_configure(game,ids[1],4,'six-card-golf','{"ante_amount":5}',deadline)->>'deduped')::boolean,'setup replay');
   FOR i IN 2..n LOOP
    PERFORM pg_temp.golf_login(users[i]);
    PERFORM public.submit_ante_decision(game,dealer,ids[i],'ante_up');
   END LOOP;
   SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=dealer;
   PERFORM pg_temp.golf_assert(m.stake=5 AND m.state->'rules'=private.golf_admission_rules(),'admission frozen');
   BEGIN UPDATE private.golf_matches SET stake=10 WHERE dealer_game_id=dealer;RAISE EXCEPTION 'stake not protected';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:immutable_match' THEN RAISE;END IF;END;
   BEGIN UPDATE public.dealer_games SET config='{}' WHERE id=dealer;RAISE EXCEPTION 'config not protected';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'megatouch:configuration_frozen' THEN RAISE;END IF;END;
   FOR turn_i IN 1..2000 LOOP
    SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=dealer;
    EXIT WHEN m.settlement IS NOT NULL;
    IF m.state->>'phase'='hole_complete' THEN
     UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=dealer;
     PERFORM private.golf_recover();
     CONTINUE;
    END IF;
    actor_i:=(m.state->>'turnIndex')::integer;
    PERFORM pg_temp.golf_login((m.state->'players'->actor_i->>'userId')::uuid);
    IF m.state->>'phase'='opening' THEN action:='open';items:=ARRAY[0,3];
    ELSIF m.state->'pending'='null'::jsonb THEN action:='draw';items:=NULL;
    ELSE
     action:='replace';
     SELECT ARRAY[coalesce(min(ordinal::integer-1) FILTER(WHERE value='false'),0)] INTO items
      FROM jsonb_array_elements_text(m.state->'tableaus'->(m.state->'players'->actor_i->>'id')->'exposed') WITH ORDINALITY c(value,ordinal);
    END IF;
    req:=gen_random_uuid();round_i:=m.round_id;rev:=m.revision;
    v:=public.golf_action(dealer,round_i,req,rev,action,items);
    prior:=public.golf_action(dealer,round_i,req,rev,action,items);
    PERFORM pg_temp.golf_assert(v->'receipt'=prior->'receipt' AND v->'revision'=prior->'revision','duplicate exact receipt and no second move');
    BEGIN PERFORM public.golf_action(dealer,round_i,req,rev,action,ARRAY[5,4]);RAISE EXCEPTION 'missing replay rejection';
     EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:replay_conflict' THEN RAISE;END IF;END;
    IF v->>'phase'<>'complete' THEN
     BEGIN PERFORM public.golf_action(dealer,round_i,gen_random_uuid(),rev,action,items);RAISE EXCEPTION 'missing stale rejection';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:stale_revision' THEN RAISE;END IF;END;
    END IF;
   END LOOP;
   SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=dealer;
   SET CONSTRAINTS ALL IMMEDIATE;
   PERFORM pg_temp.golf_assert(m.settlement IS NOT NULL AND jsonb_array_length(m.state->'holes')=9,'full nine-hole match settled');
   PERFORM pg_temp.golf_assert((SELECT count(*)=9 AND count(predecessor_round_id)=8 FROM public.rounds WHERE dealer_game_id=dealer),'nine exact linked rounds');
   PERFORM pg_temp.golf_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'one match result');
   PERFORM pg_temp.golf_assert((SELECT sum(chips)=100*n FROM public.players WHERE game_id=game),'balanced canonical balances');
   PERFORM pg_temp.golf_assert((SELECT bool_and(p.chips=100+(m.settlement->>p.id::text)::integer) FROM public.players p WHERE p.game_id=game),'exact actual chip deltas');
   PERFORM pg_temp.golf_assert((SELECT count(*)=n FROM public.session_player_snapshots snap JOIN public.players p ON p.id=snap.player_id AND snap.chips=p.chips WHERE snap.dealer_game_id=dealer),'canonical final snapshots');
   PERFORM pg_temp.golf_assert((SELECT coalesce(bool_and(unmatched_deltas='{}'),true) FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer),'balanced transfer journal');
   PERFORM private.golf_settle(dealer);
   PERFORM pg_temp.golf_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'settlement replay');
   PERFORM pg_temp.golf_assert(public.golf_action(dealer,round_i,req,rev,action,items)->'receipt'=v->'receipt','late final action receipt');
   PERFORM pg_temp.golf_login(users[4]);
   IF n<4 THEN
    BEGIN PERFORM public.golf_snapshot(dealer);RAISE EXCEPTION 'missing membership rejection';
     EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   END IF;
   SET CONSTRAINTS ALL DEFERRED;
  END LOOP;
 END LOOP;
 PERFORM pg_temp.golf_assert(NOT has_function_privilege('authenticated','private.golf_settle(uuid)','EXECUTE')
  AND NOT has_table_privilege('authenticated','private.golf_matches','SELECT'),'private authority unavailable to browser');
END $$;
SELECT 'Golf six full human matches (2/3/4 seats, both money modes), consent, receipts, successors and actual settlement passed' proof;
