-- Runs only in the isolated rollback proof. SQL authority/visibility boundaries.
DO $$
DECLARE f jsonb;m jsonb;n jsonb;d uuid;u uuid;pid uuid;g uuid;seen integer;oldrev bigint;reply jsonb;
BEGIN
 UPDATE private.canasta_release SET enabled=true;
 f:=private.canasta_concurrency_fixture(false);d:=(f->>'match')::uuid;g:=(f->>'game')::uuid;u:=(f->>'actor')::uuid;pid:=(f#>>'{players,0}')::uuid;
 SELECT state INTO m FROM private.canasta_matches WHERE dealer_game_id=d;
 n:=m||jsonb_build_object('revision',2,'automatic',jsonb_build_array(pid));
 PERFORM public.canasta_server_commit(d,1,n,'{"kind":"recover"}');
 PERFORM pg_temp.canasta_assert((SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=pid),'timeout projects autoplay and next-hand sit-out');
 n:=n||'{"revision":3,"automatic":[]}'::jsonb;
 PERFORM public.canasta_server_commit(d,2,n,jsonb_build_object('kind','control','userId',u));
 PERFORM pg_temp.canasta_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand AND NOT stand_up_next_hand AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=pid),'reclaim clears canonical intents');
 PERFORM pg_temp.canasta_assert((SELECT state->'hand'=m->'hand' FROM private.canasta_matches WHERE dealer_game_id=d),'reclaim preserves committed hand and deadline');
 -- The existing canonical checkbox RPC also feeds the private control trigger.
 UPDATE public.games SET current_round=1,total_hands=1 WHERE id=g;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u)::text,true);
 SELECT intent_version INTO oldrev FROM public.players WHERE id=pid;
 reply:=public.set_automatic_play(g,(f->>'round')::uuid,d,pid,oldrev,true);
 PERFORM pg_temp.canasta_assert(reply->>'outcome'='accepted' AND (SELECT state->'automatic' ? pid::text FROM private.canasta_matches WHERE dealer_game_id=d),'canonical automatic enable reaches shared state');
 UPDATE public.players SET sit_out_next_hand=true WHERE id=pid;
 SELECT intent_version INTO oldrev FROM public.players WHERE id=pid;
 reply:=public.set_automatic_play(g,(f->>'round')::uuid,d,pid,oldrev,false);
 PERFORM pg_temp.canasta_assert(reply->>'outcome'='accepted' AND (SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=pid)
  AND (SELECT NOT (state->'automatic' ? pid::text) FROM private.canasta_matches WHERE dealer_game_id=d),'canonical uncheck restores control');
 -- Settle through actual canonical financial authority, then apply Stand Up at finish.
 SELECT revision INTO oldrev FROM private.canasta_matches WHERE dealer_game_id=d;
 n:=(f->'next')||jsonb_build_object('revision',oldrev+1);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM public.canasta_server_commit(d,oldrev,n,'{"kind":"recover"}');
 UPDATE public.players SET stand_up_next_hand=true WHERE id=pid;
 UPDATE private.canasta_matches SET settlement=jsonb_set(settlement,'{deadline}','0') WHERE dealer_game_id=d;
 PERFORM private.canasta_finish_postgame(d);
 PERFORM pg_temp.canasta_assert((SELECT status='left' FROM public.players WHERE id=pid),'canonical terminal stand-up applied');
 SELECT revision INTO oldrev FROM private.canasta_matches WHERE dealer_game_id=d;
 PERFORM private.canasta_finish_postgame(d);
 PERFORM pg_temp.canasta_assert((SELECT finished AND revision=oldrev FROM private.canasta_matches WHERE dealer_game_id=d),'terminal worker replay is idempotent');
 PERFORM pg_temp.canasta_assert((SELECT revision=oldrev FROM public.canasta_revisions WHERE dealer_game_id=d),'final revision published');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO seen FROM public.canasta_revisions WHERE dealer_game_id=d;
 EXECUTE 'SET LOCAL ROLE postgres';
 PERFORM pg_temp.canasta_assert(seen=1,'left frozen participant receives final revision under authenticated RLS');
 PERFORM pg_temp.canasta_assert((public.canasta_server_load(d,u)->>'finished')::boolean,'left participant reconnect sees final snapshot');
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',auth.uid())::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO seen FROM public.canasta_revisions WHERE dealer_game_id=d;
 EXECUTE 'SET LOCAL ROLE postgres';
 PERFORM pg_temp.canasta_assert(seen=0,'unrelated viewer cannot see terminal revision');
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 UPDATE public.profiles SET is_active=false WHERE id=u;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO seen FROM public.canasta_revisions WHERE dealer_game_id=d;
 EXECUTE 'SET LOCAL ROLE postgres';
 PERFORM pg_temp.canasta_assert(seen=0,'inactive account cannot see terminal revision');
 UPDATE private.canasta_release SET enabled=false;
END $$;
SELECT 'canasta terminal RLS and automatic-control proof passed' AS proof;
