DO $$
DECLARE u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();p uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();g uuid:=gen_random_uuid();d uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;s jsonb;prior jsonb; m private.golf_matches;i integer;duration bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(u2);INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Timing '||u,true),(u2,'Timing '||u2,true);
 INSERT INTO public.games(id,status,current_host,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',u,false,2,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,2,100,false),(p2,g,u2,1,100,false);
 PERFORM pg_temp.golf_login(u);v:=public.golf_configure(g,p,2,'six-card-golf','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 UPDATE public.game_defaults SET golf_scoring_delay_ms=1400,golf_results_duration_ms=6000 WHERE game_type='six-card-golf';
 PERFORM pg_temp.golf_login(u2);PERFORM public.submit_ante_decision(g,d,p2,'ante_up');
 SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_assert(s#>>'{rules,presentation,scoringDelayMs}'='1200' AND s#>>'{rules,presentation,resultsDurationMs}'='5000','offer frozen across defaults edits');
 UPDATE public.game_defaults SET golf_scoring_delay_ms=1200,golf_results_duration_ms=5000 WHERE game_type='six-card-golf';
 FOR i IN 1..40 LOOP
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;EXIT WHEN m.state->>'phase'='hole_complete';
  PERFORM pg_temp.golf_login((m.state->'players'->(m.state->>'turnIndex')::integer->>'userId')::uuid);
  IF m.state->>'phase'='opening' THEN v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,'open',ARRAY[0,3]);
  ELSE v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,CASE WHEN m.state->'pending'='null'::jsonb THEN 'draw' ELSE 'reject' END);END IF;
 END LOOP;
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;s:=m.state;
 PERFORM pg_temp.golf_assert(s->>'phase'='hole_complete' AND s->>'finalReason'='prolonged_play','legal prolonged final queue completes');
 PERFORM pg_temp.golf_assert((SELECT bool_and(jsonb_array_length(value)=4) FROM jsonb_each(s#>'{presentation,hidden}')),'pre-reveal mask preserves four concealed positions each');
 PERFORM pg_temp.golf_assert((s#>>'{presentation,endsAt}')::bigint-(s#>>'{presentation,resultsAt}')::bigint=5000,'five second results');
 PERFORM pg_temp.golf_assert((s->>'deadline')::bigint=(s#>>'{presentation,endsAt}')::bigint,'next hole shares presentation end');
 PERFORM pg_temp.golf_assert((SELECT bool_and(e.value='true') FROM jsonb_each(s->'tableaus') b CROSS JOIN LATERAL jsonb_array_elements_text(b.value->'exposed') e(value)),'public final reveal remains atomic');
 PERFORM private.golf_next_hole(d,(s->>'deadline')::bigint-1);PERFORM pg_temp.golf_assert((SELECT round_id=m.round_id FROM private.golf_matches WHERE dealer_game_id=d),'no premature successor');
 PERFORM pg_temp.golf_login(u);PERFORM public.set_game_paused(g,true,d,(SELECT pause_version FROM public.games WHERE id=g));
 UPDATE private.golf_matches SET paused_at=paused_at-5000 WHERE dealer_game_id=d;
 PERFORM private.golf_recover();PERFORM pg_temp.golf_assert((SELECT state=s FROM private.golf_matches WHERE dealer_game_id=d),'paused presentation unchanged');
 PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));SELECT state INTO prior FROM private.golf_matches WHERE dealer_game_id=d;
 duration:=(prior->>'deadline')::bigint-(s->>'deadline')::bigint;
 PERFORM pg_temp.golf_assert(duration>=5000 AND (prior#>>'{presentation,startedAt}')::bigint=(s#>>'{presentation,startedAt}')::bigint+duration AND (prior#>>'{presentation,resultsAt}')::bigint=(s#>>'{presentation,resultsAt}')::bigint+duration,'pause shifts every boundary equally');
 PERFORM private.golf_next_hole(d,(prior->>'deadline')::bigint);PERFORM pg_temp.golf_assert((SELECT state->>'hole'='2' AND NOT state ? 'presentation' FROM private.golf_matches WHERE dealer_game_id=d),'successor clears presentation');
 PERFORM pg_temp.golf_assert(private.golf_supported_rules(private.golf_rules()) AND NOT private.golf_supported_rules(private.golf_rules()||'{"presentation":{"version":1,"scoringDelayMs":0,"resultsDurationMs":5000}}'),'legacy accepted invalid timing rejected');
 BEGIN UPDATE public.game_defaults SET golf_scoring_delay_ms=0 WHERE game_type='six-card-golf';RAISE EXCEPTION 'invalid default accepted';EXCEPTION WHEN check_violation THEN NULL;END;
END $$;
SELECT 'PASS timing defaults/frozen offers, reveal masks, prolonged final queue, exact results, pause/resume, successor and legacy validation' proof;
