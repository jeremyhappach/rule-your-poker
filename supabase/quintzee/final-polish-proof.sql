DO $$ DECLARE b jsonb;v jsonb;old jsonb;event jsonb;due bigint;i integer;f jsonb;d uuid;u uuid;rev bigint;req uuid;g uuid; BEGIN
 b:=private.quintzee_v3_board_start(private.quintzee_v3_rules(),1000);
 PERFORM pg_temp.quintzee_assert(b->'dice'='[]' AND b->>'rollsRemaining'='3' AND b->>'deadline'='31000','v3 initial manual Start');
 b:=private.quintzee_v3_board_reduce(b,'start','{}',2000);due:=(b->>'deadline')::bigint;
 b:=b||'{"scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15},"dice":[6,6,6,1,2]}'::jsonb;
 v:=private.quintzee_v3_board_reduce(b,'score','{5}',3000);event:=v->'celebration';
 PERFORM pg_temp.quintzee_assert(v->'dice'='[]' AND v->'held'='[]' AND v->>'rollsRemaining'='3' AND v->'rollSerial'=b->'rollSerial','score clears dice, no automatic roll');
 PERFORM pg_temp.quintzee_assert(event->>'startedAt'='3000' AND event->>'countAt'='4500' AND event->>'endsAt'='5100' AND event->>'from'='45' AND event->>'to'='98' AND (v->>'deadline')::bigint=due+2100,'one bounded pause and exact server totals');
 PERFORM pg_temp.quintzee_assert(private.quintzee_v3_board_reduce(v,'tick',NULL,5000)=v,'tick does not extend celebration');
 BEGIN PERFORM private.quintzee_v3_board_reduce(v,'roll','{}',5000);RAISE EXCEPTION 'early roll accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:celebrating' THEN RAISE;END IF;END;
 BEGIN PERFORM private.quintzee_v3_board_reduce(v,'score_zero','{6}',5100);RAISE EXCEPTION 'prior dice scored again';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:invalid_dice' THEN RAISE;END IF;END;
 BEGIN PERFORM private.quintzee_v3_board_reduce(v,'roll','{0}',5100);RAISE EXCEPTION 'prior dice held';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:roll' THEN RAISE;END IF;END;
 old:=v;v:=private.quintzee_v3_board_reduce(v,'roll','{}',5100);
 PERFORM pg_temp.quintzee_assert(v->>'rollsRemaining'='2' AND (v->>'rollSerial')::int=(old->>'rollSerial')::int+1 AND v->'deadline'=old->'deadline' AND NOT v?'celebration','manual roll consumes exactly one, does not extend deadline');
 v:=private.quintzee_v3_board_reduce(old,'tick',NULL,(old->>'deadline')::bigint);PERFORM pg_temp.quintzee_assert(v->>'phase'='stage_complete' AND v#>>'{result,reason}'='timeout','manual-wait gameplay expiry still finishes');
 -- Upper bonus on the final category preserves multiplier at scoring time and reserves the whole result window after celebration.
 b:=b||'{"scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"three_of_a_kind":0,"four_of_a_kind":0,"yahtzee":0,"full_house":0,"large_straight":0,"chance":0}}'::jsonb;
 v:=private.quintzee_v3_board_reduce(b,'score','{5}',3000);
 PERFORM pg_temp.quintzee_assert(v->>'phase'='stage_complete' AND v->>'deadline'='14100' AND v#>>'{celebration,to}'='133' AND v#>>'{result,remainingMs}'=(due-3000)::text AND v#>>'{result,completedAt}'='3000','final-category celebration does not inflate scoring multiplier');
 -- All category hands wait for explicit rolls under the same clock; no per-category ready grace.
 b:=private.quintzee_v3_board_reduce(private.quintzee_v3_board_start(private.quintzee_v3_rules(),1000),'start','{}',2000);
 FOR i IN 0..11 LOOP
 b:=b||'{"dice":[6,6,6,6,6]}'::jsonb;b:=private.quintzee_v3_board_reduce(b,CASE WHEN i=ANY(ARRAY[0,1,2,3,4,9,10]) THEN 'score_zero' ELSE 'score' END,ARRAY[i],3000+i*3000);
 IF i<11 THEN PERFORM pg_temp.quintzee_assert(b->>'phase'='playing' AND b->'dice'='[]' AND b->>'rollsRemaining'='3','every category waits');b:=private.quintzee_v3_board_reduce(b,'roll','{}',3001+i*3000);END IF;
 END LOOP;
 PERFORM pg_temp.quintzee_assert(b->>'phase'='stage_complete','all explicit hands finish');
 -- Actual multiplayer command receipts and all-away ownership.
 f:=pg_temp.quintzee_fixture(2);d:=(f->>'dealer')::uuid;g:=(f->>'game')::uuid;
 SELECT p.user_id,m.revision INTO u,rev FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE dealer_game_id=d;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);req:=gen_random_uuid();PERFORM public.quintzee_action(d,req,rev,'start','{}');
 SELECT state INTO old FROM private.quintzee_matches WHERE dealer_game_id=d;PERFORM public.quintzee_action(d,req,rev,'start','{}');PERFORM pg_temp.quintzee_assert((SELECT state=old FROM private.quintzee_matches WHERE dealer_game_id=d),'v3 duplicate Start once');
 UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board}',(state#>'{core,board}')||'{"scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15},"dice":[6,6,6,1,2]}'::jsonb)) WHERE dealer_game_id=d;
 SELECT revision INTO rev FROM private.quintzee_matches WHERE dealer_game_id=d;req:=gen_random_uuid();PERFORM public.quintzee_action(d,req,rev,'score','{5}');SELECT state INTO old FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM public.quintzee_action(d,req,rev,'score','{5}');PERFORM public.quintzee_snapshot(d);PERFORM pg_temp.quintzee_assert((SELECT state=old FROM private.quintzee_matches WHERE dealer_game_id=d),'bonus replay/reconnect cannot extend pause or award twice');
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
 PERFORM pg_temp.quintzee_assert((SELECT bot_due_at>=(state#>>'{core,board,celebration,endsAt}')::bigint FROM private.quintzee_matches WHERE dealer_game_id=d),'all-away bot waits until fixed celebration boundary');
 PERFORM pg_temp.quintzee_assert(private.quintzee_bot_choice(old,(old#>>'{core,board,celebration,endsAt}')::bigint)->>'action'='roll','autoplay explicitly rolls fresh category');
 UPDATE public.games SET is_paused=true WHERE id=g;UPDATE public.games SET is_paused=false WHERE id=g;
 PERFORM pg_temp.quintzee_assert((SELECT (state#>>'{core,board,celebration,endsAt}')::bigint-(state#>>'{core,board,celebration,startedAt}')::bigint=2100 FROM private.quintzee_matches WHERE dealer_game_id=d),'explicit pause preserves bounded sequence duration');
END $$;
