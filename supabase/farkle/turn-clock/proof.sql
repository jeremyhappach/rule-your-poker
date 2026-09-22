-- Run with the additive migration inside one isolated rollback transaction.
-- Every fixture and rule override in this file is TEST ONLY.
CREATE TEMP TABLE clock_fixture_users(id uuid PRIMARY KEY, admin boolean);
INSERT INTO clock_fixture_users VALUES(gen_random_uuid(),true),(gen_random_uuid(),false);
INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at)
SELECT id,'farkle-clock-'||id::text||'@test.invalid',jsonb_build_object('username',CASE WHEN admin THEN 'Clock Admin' ELSE 'Clock Peer' END),clock_timestamp()
FROM clock_fixture_users;
INSERT INTO public.user_roles(user_id,role)
SELECT id,'admin'::public.app_role FROM clock_fixture_users WHERE admin;

CREATE FUNCTION pg_temp.farkle_clock_assert(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $assert$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_clock_proof:%', label; END IF;
  RAISE NOTICE 'PASS %', label;
END $assert$;

CREATE FUNCTION pg_temp.farkle_clock_identity(id uuid)
RETURNS void LANGUAGE plpgsql AS $identity$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true);
END $identity$;

DO $proof$
DECLARE
  admin_id uuid; peer_id uuid; fixture_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  dg uuid; rd uuid; cfg_deadline timestamptz:=clock_timestamp()+interval '15 minutes';
  c jsonb:='{"version":1,"testOnly":true,"testLabel":"TEST ONLY: Farkle turn clock proof","ante_amount":7,"targetScore":10000,"endgame":"equal_turns","turnSeconds":60,"botDelayMs":2000,"botPolicy":"balanced","botBankThreshold":500,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[1000,1000,1000,1000,1000,1000],"5":[2000,2000,2000,2000,2000,2000],"6":[3000,3000,3000,3000,3000,3000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}'::jsonb;
  setup jsonb; result jsonb; s jsonb; baseline timestamptz; renewed timestamptz; request_id uuid; attempt integer; roll_n_ok boolean:=false;
BEGIN
  SELECT id INTO admin_id FROM clock_fixture_users WHERE admin;
  SELECT id INTO peer_id FROM clock_fixture_users WHERE NOT admin;
  IF admin_id IS NULL OR peer_id IS NULL THEN RAISE EXCEPTION 'farkle_clock_proof:admin_and_peer_required'; END IF;
  PERFORM pg_temp.farkle_clock_identity(admin_id);
  INSERT INTO public.games(id,name,status,game_type,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
  VALUES(fixture_id,'TEST ONLY: Farkle turn clock','game_selection',NULL,admin_id,1,false,cfg_deadline,false,0,0,0);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot) VALUES
   (a,fixture_id,admin_id,1,100,'active',false,false),(b,fixture_id,peer_id,3,100,'active',false,false);
  setup:=public.configure_dealer_game(fixture_id,a,1,'farkle',jsonb_build_object('ante_amount',7,'targetScore',10000,'endgame','equal_turns',
    'testConfiguration',jsonb_build_object('testOnly',true,'label',c->>'testLabel','rules',c->'rules','turnSeconds',60,'botDelayMs',2000,'botBankThreshold',500,'botPolicy','balanced')),cfg_deadline);
  dg:=(setup->'dealer_game'->>'id')::uuid;
  UPDATE public.players SET ante_decision='ante_up' WHERE game_id=fixture_id;
  PERFORM private.advance_ante_phase_exact(fixture_id,dg,(SELECT ante_decision_deadline FROM public.games WHERE id=fixture_id),clock_timestamp());
  SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
  PERFORM pg_temp.farkle_clock_assert(rd IS NOT NULL AND s->>'currentTurnPlayerId'=b::text,'left-of-dealer human begins');
  PERFORM pg_temp.farkle_clock_assert((s->'config'->>'turnSeconds')::integer=60
    AND (s->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()+interval '58 seconds' AND clock_timestamp()+interval '61 seconds','fresh human gets 60 seconds');
  baseline:=(s->>'turnDeadline')::timestamptz;
  PERFORM pg_temp.farkle_clock_identity(peer_id);
  result:=public.farkle_apply_action(rd,b,'roll',0,gen_random_uuid());
  PERFORM pg_temp.farkle_clock_assert(result->>'outcome'='applied','initial Roll action accepted');
  IF result->'state'->>'currentTurnPlayerId'=b::text THEN
    PERFORM pg_temp.farkle_clock_assert((result->'state'->>'turnDeadline')::timestamptz=baseline,'initial Roll preserves exact deadline');
  ELSE
    PERFORM pg_temp.farkle_clock_assert(EXISTS (SELECT 1 FROM jsonb_array_elements(result->'state'->'events') event WHERE event->>'type'='farkle'),'only a Farkle may end initial Roll');
  END IF;

  -- Use an exact server-produced roll state to prove a partial Hold cannot renew time.
  PERFORM private.farkle_claim_v1(fixture_id,dg,rd,'action');
  s:=private.farkle_new_state_v1(jsonb_build_array(b,a),c,rd);
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
  baseline:=clock_timestamp()+interval '42 seconds';
  s:=jsonb_set(s,'{turnDeadline}',to_jsonb(baseline));
  UPDATE public.rounds SET farkle_state=s WHERE id=rd;
  PERFORM set_config('app.farkle_authority','',true);
  PERFORM pg_temp.farkle_clock_identity(peer_id);
  result:=public.farkle_apply_action(rd,b,'hold',1,gen_random_uuid(),'[0]'::jsonb);
  PERFORM pg_temp.farkle_clock_assert(result->>'outcome'='applied' AND result->'state'->>'currentTurnPlayerId'=b::text
    AND (result->'state'->>'turnDeadline')::timestamptz=baseline,'ordinary Hold preserves exact deadline');
  SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
  PERFORM pg_temp.farkle_clock_assert((s->>'turnDeadline')::timestamptz=baseline,'fresh authoritative read retains same deadline');

  -- Roll N uses the real action/RNG path. Retry only if a legitimate Farkle ends the turn.
  FOR attempt IN 1..8 LOOP
    PERFORM private.farkle_claim_v1(fixture_id,dg,rd,'action');
    s:=private.farkle_new_state_v1(jsonb_build_array(b,a),c,rd);
    s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',100,'available',jsonb_build_array(1,2,3,4,5),
      'actionSequence',100+attempt,'turnDeadline',to_jsonb(baseline));
    UPDATE public.rounds SET farkle_state=s WHERE id=rd;
    PERFORM set_config('app.farkle_authority','',true);
    result:=public.farkle_apply_action(rd,b,'roll',100+attempt,gen_random_uuid());
    IF result->'state'->>'currentTurnPlayerId'=b::text THEN
      PERFORM pg_temp.farkle_clock_assert((result->'state'->>'turnDeadline')::timestamptz=baseline,'Roll N preserves exact deadline');
      roll_n_ok:=true; EXIT;
    END IF;
  END LOOP;
  PERFORM pg_temp.farkle_clock_assert(roll_n_ok,'non-Farkle Roll N observed');

  -- A server-produced all-six Hold is the sole same-actor renewal.
  PERFORM private.farkle_claim_v1(fixture_id,dg,rd,'action');
  s:=private.farkle_new_state_v1(jsonb_build_array(b,a),c,rd);
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,1,1,5,5,5]);
  s:=s||jsonb_build_object('actionSequence',300,'turnDeadline',to_jsonb(clock_timestamp()+interval '4 seconds'));
  UPDATE public.rounds SET farkle_state=s WHERE id=rd;
  PERFORM set_config('app.farkle_authority','',true);
  request_id:=gen_random_uuid();
  result:=public.farkle_apply_action(rd,b,'hold',300,request_id,'[0,1,2,3,4,5]'::jsonb);
  renewed:=(result->'state'->>'turnDeadline')::timestamptz;
  PERFORM pg_temp.farkle_clock_assert(result->'state'->>'currentTurnPlayerId'=b::text
    AND result->'state'->>'scoringCycle'='2'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(result->'state'->'events') event WHERE event->>'type'='hot_dice')
    AND renewed BETWEEN clock_timestamp()+interval '58 seconds' AND clock_timestamp()+interval '61 seconds','authoritative HOT DICE renews 60 seconds');
  result:=public.farkle_apply_action(rd,b,'hold',300,request_id,'[0,1,2,3,4,5]'::jsonb);
  PERFORM pg_temp.farkle_clock_assert(result->>'deduped'='true' AND (result->'state'->>'turnDeadline')::timestamptz=renewed,'duplicate Hold cannot renew twice');
  PERFORM private.farkle_claim_v1(fixture_id,dg,rd,'action');
  s:=private.farkle_reduce_v1(result->'state','roll','[]'::jsonb,ARRAY[1,1,1,5,5,5]);
  s:=jsonb_set(s,'{turnDeadline}',to_jsonb(clock_timestamp()+interval '4 seconds'));
  UPDATE public.rounds SET farkle_state=s WHERE id=rd;
  PERFORM set_config('app.farkle_authority','',true);
  result:=public.farkle_apply_action(rd,b,'hold',302,gen_random_uuid(),'[0,1,2,3,4,5]'::jsonb);
  PERFORM pg_temp.farkle_clock_assert(result->'state'->>'scoringCycle'='3'
    AND (result->'state'->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()+interval '58 seconds' AND clock_timestamp()+interval '61 seconds','second HOT DICE earns another 60 seconds');
  result:=public.farkle_apply_action(rd,b,'bank',303,gen_random_uuid());
  PERFORM pg_temp.farkle_clock_assert(result->'state'->>'currentTurnPlayerId'=a::text
    AND (result->'state'->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()+interval '58 seconds' AND clock_timestamp()+interval '61 seconds','Bank gives next human a new clock');

  -- Expired fake-money human still enters the bot action path at bot pacing.
  PERFORM private.farkle_claim_v1(fixture_id,dg,rd,'action');
  s:=private.farkle_new_state_v1(jsonb_build_array(a,b),c,rd);
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,2,3,4,6,2]);
  s:=s||jsonb_build_object('actionSequence',400,'turnDeadline',to_jsonb(clock_timestamp()-interval '1 second'));
  UPDATE public.rounds SET farkle_state=s WHERE id=rd;
  PERFORM set_config('app.farkle_authority','',true);
  result:=private.farkle_advance_due_v1(rd);
  PERFORM pg_temp.farkle_clock_assert(result->>'outcome'='applied' AND (SELECT auto_fold FROM public.players WHERE id=a)
    AND result->'state'->>'currentTurnPlayerId'=a::text
    AND (result->'state'->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()+interval '1 second' AND clock_timestamp()+interval '3 seconds','fake-money takeover retains bot pacing');

  -- Real-money expiration pauses without a bot scoring action.
  PERFORM private.farkle_claim_v1(fixture_id,dg,rd,'action');
  UPDATE public.players SET auto_fold=false WHERE id=a;
  UPDATE public.games SET real_money=true WHERE id=fixture_id;
  s:=jsonb_set(result->'state','{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second'));
  UPDATE public.rounds SET farkle_state=s WHERE id=rd;
  PERFORM set_config('app.farkle_authority','',true);
  result:=private.farkle_advance_due_v1(rd);
  PERFORM pg_temp.farkle_clock_assert((SELECT is_paused FROM public.games WHERE id=fixture_id)
    AND NOT (SELECT auto_fold FROM public.players WHERE id=a)
    AND (SELECT farkle_state->>'actionSequence' FROM public.rounds WHERE id=rd)=s->>'actionSequence','real-money timeout pauses without action');
END $proof$;
