-- Caller must wrap in rollback. These tests use only newly-created fixture identities.
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;deadline timestamptz;
 money boolean;reply jsonb;before_i jsonb;after_i jsonb;i integer;
BEGIN
 UPDATE private.canasta_release SET enabled=true,admission_enabled=false;
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Canasta admission '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
  ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];g:=gen_random_uuid();deadline:=clock_timestamp()+interval '120 seconds';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,config_deadline) VALUES(g,'game_selection',money,1,0,false,deadline);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   SELECT ids[j],g,users[j],j,100,false,'active',false,false FROM generate_series(1,2) j;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  PERFORM pg_temp.canasta_assert(public.canasta_capabilities(g)->>'enabled'='false','closed admission hides both modes');
  BEGIN
   PERFORM public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline);
   RAISE EXCEPTION 'missing admission rejection';
  EXCEPTION WHEN insufficient_privilege THEN
   PERFORM pg_temp.canasta_assert(SQLERRM=CASE WHEN money THEN 'canasta:fake_money_only' ELSE 'canasta:admission_closed' END,'closed setup rejects');
  END;
  UPDATE private.canasta_release SET admission_enabled=true;
  PERFORM pg_temp.canasta_assert((public.canasta_capabilities(g)->>'enabled')::boolean=NOT money,'discovery respects session money mode');
  SELECT jsonb_build_object('game',to_jsonb(t),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.players p WHERE game_id=g)) INTO before_i FROM public.games t WHERE id=g;
  IF money THEN
   -- Direct configure and Run Back both use this RPC; config cannot override session mode.
   EXECUTE 'SET LOCAL ROLE authenticated';
   BEGIN
    PERFORM public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10,"real_money":false}',deadline);
    RAISE EXCEPTION 'missing fake-only rejection';
   EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.canasta_assert(SQLERRM='canasta:fake_money_only','real-money authenticated RPC rejected');
   END;
   EXECUTE 'SET LOCAL ROLE postgres';
   SELECT jsonb_build_object('game',to_jsonb(t),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.players p WHERE game_id=g)) INTO after_i FROM public.games t WHERE id=g;
   PERFORM pg_temp.canasta_assert(before_i=after_i AND NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=g)
    AND NOT EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=g)
    AND NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE game_id=g),'rejection has no setup or financial writes');
   -- Independently defend the internal consent boundary even with a constructed setup.
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g,users[1],'canasta',jsonb_build_object('ante_amount',10,'rules',private.canasta_rules())) RETURNING id INTO d;
   UPDATE public.games SET current_game_uuid=d,game_type='canasta',status='ante_decision' WHERE id=g;
   BEGIN PERFORM private.canasta_begin(g,d);RAISE EXCEPTION 'missing begin money guard';
   EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.canasta_assert(SQLERRM='canasta:fake_money_only','consent completion rejects real money');END;
   PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=d)
    AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE dealer_game_id=d),'no real-money hand admitted');
  ELSE
   EXECUTE 'SET LOCAL ROLE authenticated';
   reply:=public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline);
   EXECUTE 'SET LOCAL ROLE postgres';
   d:=(reply#>>'{dealer_game,id}')::uuid;
   PERFORM pg_temp.canasta_assert(reply->>'outcome'='configured','fake-money configure accepted');
   -- A mode change after genuine setup cannot admit a real-money match.
   UPDATE public.games SET real_money=true WHERE id=g;
   BEGIN PERFORM private.canasta_begin(g,d);RAISE EXCEPTION 'missing changed-mode rejection';
   EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.canasta_assert(SQLERRM='canasta:fake_money_only','mode changed between setup and consent');END;
   PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=d),'changed mode creates no match');
   UPDATE public.games SET real_money=false WHERE id=g;
   UPDATE private.canasta_release SET admission_enabled=false;
   PERFORM pg_temp.canasta_assert(public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline)->>'outcome'='already_configured','closing admission preserves committed setup retry');
  END IF;
  UPDATE private.canasta_release SET admission_enabled=false;
 END LOOP;
 PERFORM pg_temp.canasta_assert(NOT has_function_privilege('authenticated','private.canasta_begin(uuid,uuid)','EXECUTE'),'browser cannot bypass consent boundary');
 UPDATE private.canasta_release SET enabled=false,admission_enabled=false;
END $$;
SELECT 'canasta fake-only admission proof passed' AS proof;
