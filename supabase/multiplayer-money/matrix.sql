CREATE FUNCTION pg_temp.money_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'money_qualification:%',label;END IF;END$$;
CREATE TEMP TABLE money_evidence(case_name text,game_id uuid,dealer_game_id uuid,before_balances jsonb,after_balances jsonb,result jsonb,batch jsonb);
CREATE FUNCTION pg_temp.fail_after_chips() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('qualification.fail_after_chips',true)='on' THEN
  PERFORM pg_temp.money_assert(EXISTS(SELECT 1 FROM public.players WHERE game_id=NEW.game_id AND chips<>100),'failure injection must follow actual chip writes');
  RAISE EXCEPTION 'qualification:after_chip_writes';
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER qualification_after_chips BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_after_chips();
DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 p uuid[];g uuid;d uuid;deadline timestamptz;offer jsonb;v jsonb;before_b jsonb;after_b jsonb;totals jsonb;changes jsonb;b jsonb;r jsonb;
 n integer;i integer;scenario text;stake_i integer:=17;expected_total integer;failed boolean;real_mode boolean;
BEGIN
 INSERT INTO auth.users(id) SELECT unnest(u);
 INSERT INTO public.profiles(id,username,is_active) SELECT x,'Money '||x::text,true FROM unnest(u)x ON CONFLICT(id) DO UPDATE SET is_active=true;
 FOREACH real_mode IN ARRAY ARRAY[true,false] LOOP
 FOR n IN 2..7 LOOP
 FOREACH scenario IN ARRAY ARRAY['winner','split','all_tie'] LOOP
  PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);
  g:=gen_random_uuid();p:=ARRAY(SELECT gen_random_uuid() FROM generate_series(1,n));deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',real_mode,n,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot,auto_ante) SELECT p[x],g,u[x],n+1-x,100,'active',false,false,false,true FROM generate_series(1,n)x;
  SELECT jsonb_object_agg(id,chips) INTO before_b FROM public.players WHERE game_id=g;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  offer:=public.__FAMILY___configure(g,p[1],n,'__GAME__',jsonb_build_object('ante_amount',stake_i),deadline);
  EXECUTE 'RESET ROLE';d:=(offer#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.money_assert((SELECT status='ante_decision' AND ante_amount=17 FROM public.games WHERE id=g),'normal stake offer');
  PERFORM pg_temp.money_assert((SELECT count(*)=n-1 FROM public.players WHERE game_id=g AND ante_decision IS NULL),'no automatic human consent');
  PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM private.__FAMILY___matches WHERE dealer_game_id=d),'no pre-consent match');
  failed:=false;BEGIN PERFORM public.__FAMILY___configure(g,p[1],n,'__GAME__','{"ante_amount":18}',deadline);EXCEPTION WHEN OTHERS THEN IF SQLERRM='__FAMILY__:setup_replay_conflict' THEN failed:=true;ELSE RAISE;END IF;END;
  PERFORM pg_temp.money_assert(failed,'changed offered stake rejected');
  failed:=false;BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{ante_amount}','18') WHERE id=d;EXCEPTION WHEN OTHERS THEN IF SQLERRM='megatouch:configuration_frozen' THEN failed:=true;ELSE RAISE;END IF;END;
  PERFORM pg_temp.money_assert(failed,'offered configuration immutable');
  FOR i IN 2..n LOOP
   PERFORM set_config('request.jwt.claim.sub',u[i]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[i],'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   v:=public.submit_ante_decision(g,gen_random_uuid(),p[i],'ante_up');
   PERFORM pg_temp.money_assert(v->>'outcome'='stale_identity','stale offer rejected');
   v:=public.submit_ante_decision(g,d,p[i],'ante_up');
   EXECUTE 'RESET ROLE';
   PERFORM pg_temp.money_assert(v->>'outcome'='accepted','human accepts exact offer');
   IF i<n THEN PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM private.__FAMILY___matches WHERE dealer_game_id=d),'wait for every required consent');END IF;
  END LOOP;
  PERFORM pg_temp.money_assert((SELECT stake=stake_i AND jsonb_array_length(state->'players')=n FROM private.__FAMILY___matches WHERE dealer_game_id=d),'frozen stake and roster');
  PERFORM pg_temp.money_assert((SELECT count(*)=1 FROM public.rounds WHERE dealer_game_id=d),'one competition');
  SELECT jsonb_object_agg(p[x]::text,CASE WHEN scenario='all_tie' OR x=1 OR (scenario='split' AND x=2) THEN 100 ELSE 0 END) INTO totals FROM generate_series(1,n)x;
  -- Synthetic terminal score vectors isolate financial branches; separate live-game proof is required.
  UPDATE private.__FAMILY___matches SET state=state||jsonb_build_object('phase','complete','scores',totals,'turnIndex',n) WHERE dealer_game_id=d;
  IF scenario='winner' THEN
   PERFORM set_config('qualification.fail_after_chips','on',true);failed:=false;
   BEGIN PERFORM private.__FAMILY___settle(d);EXCEPTION WHEN OTHERS THEN IF SQLERRM='qualification:after_chip_writes' THEN failed:=true;ELSE RAISE;END IF;END;
   PERFORM set_config('qualification.fail_after_chips','off',true);
   PERFORM pg_temp.money_assert(failed,'failure after chip writes was injected');
   PERFORM pg_temp.money_assert((SELECT jsonb_object_agg(id,chips)=before_b FROM public.players WHERE game_id=g),'failure rolled back all balances');
   PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=d) AND NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d) AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE dealer_game_id=d) AND (SELECT settlement IS NULL FROM private.__FAMILY___matches WHERE dealer_game_id=d),'failure left no financial artifacts');
  END IF;
  IF scenario='all_tie' THEN UPDATE public.games SET pending_session_end=true WHERE id=g;END IF;
  PERFORM private.__FAMILY___settle(d);PERFORM private.__FAMILY___settle(d);SET CONSTRAINTS ALL IMMEDIATE;
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
  SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;END LOOP;
END$$;
SELECT * FROM money_evidence;
