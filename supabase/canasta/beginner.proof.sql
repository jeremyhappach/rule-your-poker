-- Append after the existing isolated local rollback proof and beginner.candidate.sql.
-- Never run this file against production; it intentionally modifies synthetic state.
DO $$
DECLARE f jsonb; d uuid; g uuid; m jsonb; n jsonb; v bigint; budget bigint; u uuid; other_u uuid;
BEGIN
 UPDATE public.game_defaults SET canasta_mode='beginner',decision_timer_seconds=90 WHERE game_type='canasta';
 PERFORM pg_temp.canasta_assert(private.canasta_pacing_defaults()->>'turnMs'='180000','Beginner uses 180 seconds');
 UPDATE public.game_defaults SET canasta_mode='expert' WHERE game_type='canasta';
 PERFORM pg_temp.canasta_assert(private.canasta_pacing_defaults()->>'turnMs'='90000','Expert uses configured timer');
 UPDATE private.canasta_release SET enabled=true;
 f:=private.canasta_concurrency_fixture(false);d:=(f->>'match')::uuid;g:=(f->>'game')::uuid;u:=(f->>'actor')::uuid;
 SELECT state INTO m FROM private.canasta_matches WHERE dealer_game_id=d;
 m:=m||jsonb_build_object('config',private.canasta_pacing_defaults());
 UPDATE private.canasta_matches SET state=m WHERE dealer_game_id=d;
 -- Authoritative config cannot be replaced by a service commit, including timing.
 n:=jsonb_set(m,'{config,turnMs}','180000')||'{"revision":2}'::jsonb;
 BEGIN PERFORM public.canasta_server_commit(d,1,n,'{"kind":"recover"}');RAISE EXCEPTION 'missing config fence';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta:state_identity' THEN RAISE;END IF;END;
 -- Both away is a normal fake-money continuation; canonical sit-out remains queued.
 n:=m||jsonb_build_object('revision',2,'automatic',jsonb_build_array(f#>>'{players,0}',f#>>'{players,1}'));
 PERFORM public.canasta_server_commit(d,1,n,'{"kind":"recover"}');
 PERFORM pg_temp.canasta_assert((SELECT bool_and(auto_fold AND sit_out_next_hand) FROM public.players WHERE game_id=g),'canonical auto-play flags for both absent humans');
 SELECT revision,state INTO v,m FROM private.canasta_matches WHERE dealer_game_id=d;
 n:=jsonb_set(jsonb_set(m,'{hand,turn}','2'),'{revision}',to_jsonb(v+1));
 PERFORM public.canasta_server_commit(d,v,n,'{"kind":"recover"}');
 SELECT (state#>>'{hand,deadline}')::bigint-floor(extract(epoch FROM clock_timestamp())*1000) INTO budget FROM private.canasta_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.canasta_assert(budget BETWEEN 88000 AND 90000,'server gives frozen Expert turn budget with no humans present');
 -- Changing defaults never changes an admitted match.
 UPDATE public.game_defaults SET canasta_mode='beginner',decision_timer_seconds=120 WHERE game_type='canasta';
 PERFORM pg_temp.canasta_assert((SELECT state#>>'{config,turnMs}'='90000' FROM private.canasta_matches WHERE dealer_game_id=d),'defaults do not rewrite match');
 SELECT user_id INTO other_u FROM public.players WHERE game_id=g AND user_id<>u LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 UPDATE public.profiles SET canasta_helpers=false WHERE id=u;
 UPDATE public.profiles SET canasta_helpers=false WHERE id=other_u;
 EXECUTE 'SET LOCAL ROLE postgres';
 PERFORM pg_temp.canasta_assert((SELECT NOT canasta_helpers FROM public.profiles WHERE id=u),'own helper preference saved');
 PERFORM pg_temp.canasta_assert((SELECT canasta_helpers FROM public.profiles WHERE id=other_u),'other player preference protected');
END $$;
SELECT 'Canasta Beginner/Expert follow-up boundaries passed' AS result;
