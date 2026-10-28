BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE bot_existing_balances ON COMMIT DROP AS SELECT id,chips FROM public.players;
CREATE FUNCTION pg_temp.money_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'money_qualification:%',label;END IF;END$$;
CREATE TEMP TABLE money_evidence(case_name text,game_id uuid,dealer_game_id uuid,before_balances jsonb,after_balances jsonb,result jsonb,batch jsonb);
DO $$
DECLARE u uuid[]:=ARRAY['a9e05d1e-ea2e-48d3-94df-aeedfe07e227'::uuid,'4cab5bd5-d11c-488b-aecd-d7525ec4a4ab'::uuid,'fca48af2-04b6-41a6-b0d7-ce36f44bd69f'::uuid,'9ed3a372-4dd9-4182-b6ba-037db7976e3b'::uuid,'032735e3-a976-480d-9dfe-a2710499a8cd'::uuid,'7d5819df-d347-47fe-b945-f69f7a024a37'::uuid,'4a2b70fb-fad7-4206-92e2-5b464b15cb39'::uuid];
 p uuid[];g uuid;d uuid;deadline timestamptz;offer jsonb;v jsonb;before_b jsonb;after_b jsonb;totals jsonb;changes jsonb;b jsonb;r jsonb;
 n integer;i integer;scenario text;stake_i integer:=17;expected_total integer;failed boolean;real_mode boolean;
BEGIN
 INSERT INTO auth.users(id) SELECT unnest(u);
 INSERT INTO public.profiles(id,username,is_active) SELECT x,'Money '||x::text,true FROM unnest(u)x ON CONFLICT(id) DO UPDATE SET is_active=true;
 FOREACH real_mode IN ARRAY ARRAY[true,false] LOOP
 FOR n IN 3..3 LOOP
 FOREACH scenario IN ARRAY ARRAY['winner','split','all_tie'] LOOP
  PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);
  g:=gen_random_uuid();p:=ARRAY(SELECT gen_random_uuid() FROM generate_series(1,n));deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',real_mode,n,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot,auto_ante) SELECT p[x],g,u[x],n+1-x,100,'active',false,false,x>1 AND NOT real_mode,true FROM generate_series(1,n)x;
  SELECT jsonb_object_agg(id,chips) INTO before_b FROM public.players WHERE game_id=g;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  offer:=public.eleven_up_configure(g,p[1],n,'eleven-up',jsonb_build_object('ante_amount',stake_i),deadline);
  EXECUTE 'RESET ROLE';d:=(offer#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.money_assert((SELECT status='ante_decision' AND ante_amount=17 FROM public.games WHERE id=g),'normal stake offer');
  PERFORM pg_temp.money_assert((SELECT count(*)=n-1 FROM public.players WHERE game_id=g AND ante_decision IS NULL),'no automatic human consent');
  PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM private.eleven_up_matches WHERE dealer_game_id=d),'no pre-consent match');
  failed:=false;BEGIN PERFORM public.eleven_up_configure(g,p[1],n,'eleven-up','{"ante_amount":18}',deadline);EXCEPTION WHEN OTHERS THEN IF SQLERRM='eleven_up:setup_replay_conflict' THEN failed:=true;ELSE RAISE;END IF;END;
  PERFORM pg_temp.money_assert(failed,'changed offered stake rejected');
  failed:=false;BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{ante_amount}','18') WHERE id=d;EXCEPTION WHEN OTHERS THEN IF SQLERRM='megatouch:configuration_frozen' THEN failed:=true;ELSE RAISE;END IF;END;
  PERFORM pg_temp.money_assert(failed,'offered configuration immutable');
  IF real_mode THEN
  FOR i IN 2..n LOOP
   PERFORM set_config('request.jwt.claim.sub',u[i]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[i],'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   v:=public.submit_ante_decision(g,gen_random_uuid(),p[i],'ante_up');
   PERFORM pg_temp.money_assert(v->>'outcome'='stale_identity','stale offer rejected');
   v:=public.submit_ante_decision(g,d,p[i],'ante_up');
   EXECUTE 'RESET ROLE';
   PERFORM pg_temp.money_assert(v->>'outcome'='accepted','human accepts exact offer');
   IF i<n THEN PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM private.eleven_up_matches WHERE dealer_game_id=d),'wait for every required consent');END IF;
  END LOOP;
  ELSE PERFORM public.advance_ante_phase(g,d);END IF;
  PERFORM pg_temp.money_assert((SELECT stake=stake_i AND jsonb_array_length(state->'players')=n FROM private.eleven_up_matches WHERE dealer_game_id=d),'frozen stake and roster');
  PERFORM pg_temp.money_assert((SELECT count(*)=1 FROM public.rounds WHERE dealer_game_id=d),'one competition');
  SELECT jsonb_object_agg(p[x]::text,CASE WHEN scenario='all_tie' OR x=1 OR (scenario='split' AND x=2) THEN 100 ELSE 0 END) INTO totals FROM generate_series(1,n)x;
  -- Synthetic terminal score vectors isolate financial branches; separate live-game proof is required.
  UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('phase','complete','scores',totals,'turnIndex',n) WHERE dealer_game_id=d;
  IF scenario='all_tie' THEN UPDATE public.games SET pending_session_end=true WHERE id=g;END IF;
  PERFORM private.eleven_up_settle(d);PERFORM private.eleven_up_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
  SELECT jsonb_object_agg(id,chips) INTO after_b FROM public.players WHERE game_id=g;
  SELECT to_jsonb(x),player_chip_changes INTO r,changes FROM public.game_results x WHERE dealer_game_id=d;
  SELECT to_jsonb(x) INTO b FROM public.gameplay_transfer_batches x WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'exactly one result');
  PERFORM pg_temp.money_assert((SELECT sum(chips)=100*n FROM public.players WHERE game_id=g),'conservation of funds');
  PERFORM pg_temp.money_assert((SELECT bool_and(chips-100=coalesce((changes->>id::text)::integer,0)) FROM public.players WHERE game_id=g),'result equals actual canonical deltas');
  PERFORM pg_temp.money_assert((SELECT count(*)=n FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=d),'every final snapshot equals balances');
  IF scenario='winner' THEN
   PERFORM pg_temp.money_assert((after_b->>p[1]::text)::integer=100+(n-1)*stake_i AND (SELECT bool_and(chips=83) FROM public.players WHERE game_id=g AND id<>p[1]),'exact winner and loser balances');
  ELSIF scenario='all_tie' THEN
   PERFORM pg_temp.money_assert(after_b=before_b AND (SELECT status='session_ended' FROM public.games WHERE id=g),'all tie no transfer and ended');
  ELSE
   PERFORM pg_temp.money_assert((SELECT sum(chips-100)=(n-2)*stake_i AND max(chips)-min(chips)<=1 FROM public.players WHERE id=ANY(p[1:2])),'whole-chip split and remainder');
  END IF;
  IF scenario='winner' OR (scenario='split' AND n>2) THEN
   PERFORM pg_temp.money_assert(b->'unmatched_deltas'='{}'::jsonb AND jsonb_array_length(b->'transfers')>0,'canonical balanced journal');
  END IF;
  INSERT INTO money_evidence VALUES(CASE WHEN real_mode THEN 'real ' ELSE 'fake ' END||n||'-player '||scenario,g,d,before_b,after_b,r,b);
  IF NOT real_mode AND scenario='winner' THEN
   UPDATE public.players SET sit_out_next_hand=true WHERE game_id=g AND NOT is_bot;
   UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
   PERFORM private.eleven_up_finish_postgame(d);
   IF position('eleven_up_next_game_human_eligibility_v1' IN pg_get_functiondef('private.eleven_up_finish_postgame(uuid)'::regprocedure))>0 THEN
    PERFORM pg_temp.money_assert((SELECT status='waiting' AND current_game_uuid IS NULL AND config_deadline IS NULL FROM public.games WHERE id=g),'multiple bots cannot start next game without eligible human');
   END IF;
   PERFORM private.eleven_up_settle(d);
   PERFORM pg_temp.money_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'late replay does not settle twice');
  END IF;
  SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;END LOOP;
END$$;


DO $controls$
DECLARE real_mode boolean; u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; people uuid[]; g uuid; d uuid; p uuid; who uuid;
 m private.eleven_up_matches; before_state jsonb; old_revision bigint; deadline timestamptz; v jsonb; i integer; offset_i integer;
BEGIN
 FOREACH real_mode IN ARRAY ARRAY[true,false] LOOP
  offset_i:=CASE WHEN real_mode THEN 0 ELSE 3 END; g:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  FOR i IN 1..3 LOOP
   INSERT INTO auth.users(id) VALUES(u[offset_i+i]);
   INSERT INTO public.profiles(id,username,is_active) VALUES(u[offset_i+i],'Ready qualification '||u[offset_i+i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
  END LOOP;
  deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
  VALUES(g,u[offset_i+1],'game_selection',real_mode,3,deadline,0,false,false);
  FOR i IN 1..3 LOOP INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   VALUES(people[i],g,u[offset_i+i],4-i,100,false,'active',false,false);END LOOP;
  PERFORM set_config('request.jwt.claim.sub',u[offset_i+1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[offset_i+1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v:=public.eleven_up_configure(g,people[1],3,'eleven-up','{"ante_amount":7}',deadline);d:=(v#>>'{dealer_game,id}')::uuid;
  EXECUTE 'RESET ROLE';
  FOR i IN 2..3 LOOP
   PERFORM set_config('request.jwt.claim.sub',u[offset_i+i]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[offset_i+i],'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(g,d,people[i],'ante_up');EXECUTE 'RESET ROLE';
  END LOOP;
  UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=d;
  UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-100)),revision=revision+1 WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  p:=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid;SELECT user_id INTO who FROM public.players WHERE id=p;
  PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;PERFORM 1 FROM public.games WHERE id=g FOR UPDATE;
  PERFORM 1 FROM private.eleven_up_matches WHERE dealer_game_id=d FOR UPDATE;
  IF NOT real_mode THEN UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g AND id<>p;END IF;
  PERFORM pg_temp.money_assert(private.eleven_up_ready_timeout(d),'Ready timeout handled');
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert((SELECT is_paused=(real_mode OR position('eleven_up_active_fake_completion_v1' IN pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure))=0) FROM public.games WHERE id=g),'money mode pause distinction');
  PERFORM pg_temp.money_assert(m.state->>'phase'=CASE WHEN real_mode OR position('eleven_up_active_fake_completion_v1' IN pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure))=0 THEN 'ready' ELSE 'playing' END,'Ready preserves real / fake strategic first move');
  before_state:=m.state;old_revision:=m.revision;
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  v:=public.eleven_up_snapshot(d);
  IF NOT real_mode THEN
   PERFORM pg_temp.money_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(v->'players') x WHERE x->>'id'=p::text AND (x->>'autoplay')::boolean),'reload projects away flag');
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.eleven_up_reclaim(d,m.revision);EXECUTE 'RESET ROLE';
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert(m.state=before_state AND m.bot_due_at IS NULL,'reclaim preserves clocks and cancels bot');
  PERFORM pg_temp.money_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=p),'reclaim clears flags');
  PERFORM pg_temp.money_assert((SELECT is_paused=(real_mode OR position('eleven_up_active_fake_completion_v1' IN pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure))=0) FROM public.games WHERE id=g),'reclaim does not resume');
 END LOOP;
END $controls$;
DO $preserve$ BEGIN
 PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM bot_existing_balances b LEFT JOIN public.players p USING(id) WHERE p.id IS NULL OR p.chips IS DISTINCT FROM b.chips),'existing balances unchanged');
 PERFORM pg_temp.money_assert((SELECT count(*)=6 FROM money_evidence),'six financial cases');
END $preserve$;
SELECT jsonb_build_object('financialCases',(SELECT count(*) FROM money_evidence),'readyModes',2,'existingBalancesPreserved',true,'installed',position('eleven_up_active_fake_completion_v1' IN pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure))>0) qualification;
ROLLBACK;
