DO $$
DECLARE s jsonb;single jsonb;choice jsonb;i integer;j integer;at_ms bigint;p uuid:=gen_random_uuid();u uuid:=gen_random_uuid();results jsonb;last_score bigint;expected integer;count_i integer;
BEGIN
 FOR j IN 1..20 LOOP
  s:=private.boxdrop_deal(jsonb_build_object('rules',private.boxdrop_rules(),'players',jsonb_build_array(jsonb_build_object('id',p,'userId',u,'isBot',true)),'scores','{}'::jsonb,'stages','[]'::jsonb,'turnIndex',0,'stage',1,'identity',jsonb_build_object('dealerGameId',p,'roundId',p)),1000);
  single:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
  FOR i IN 0..134 LOOP
   at_ms:=3500+i*750;
   choice:=private.boxdrop_bot_choice(private.boxdrop_visible(s),at_ms);
   s:=private.boxdrop_reduce(s,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
   single:=private.boxdrop_board_reduce(single,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
   PERFORM pg_temp.box_assert(s->'scales'=single->'scales' AND s->'queue'=single->'queue' AND s->'score'=single->'score' AND s->'deadline'=single->'deadline' AND s->'result'=single->'result','cross-mode deterministic visible-input parity');
   -- Independent production draws are intentionally different. Replay the
   -- multiplayer draw into the next test input; never expose an RNG override.
   single:=jsonb_set(single,'{current}',s->'current');
   EXIT WHEN s->>'phase'='stage_complete';
  END LOOP;
  PERFORM pg_temp.box_assert(s->>'phase'='stage_complete' AND (s#>>'{result,completedAt}')::bigint<=103500,'bounded bot cannot recycle indefinitely');
 END LOOP;
 FOR j IN 0..3 LOOP
  s:=private.boxdrop_deal(jsonb_build_object('rules',private.boxdrop_rules(),'players',jsonb_build_array(jsonb_build_object('id','a','userId',u),jsonb_build_object('id','b','userId',u)),'scores','{}'::jsonb,'stages','[]'::jsonb,'turnIndex',0,'stage',1,'identity',jsonb_build_object('dealerGameId',p,'roundId',p)),1000);
  FOR i IN 0..3 LOOP
   PERFORM pg_temp.box_assert((s->>'turnIndex')::int=i%2 AND (s->>'stage')::int=1+i/2,'P1 R1, P2 R1, P1 R2, P2 R2 schedule');
   IF i>=2 THEN s:=s||jsonb_build_object('score',CASE WHEN (j & (1<<(i%2)))<>0 THEN 100000 ELSE 99999 END);END IF;
   s:=private.boxdrop_reduce(s,'take_score',NULL,(s->>'deadline')::bigint);
   s:=private.boxdrop_reduce(s,'tick',NULL,(s->>'deadline')::bigint);
  END LOOP;
  count_i:=0;
  WHILE s->>'phase'<>'complete' LOOP
   expected:=CASE WHEN count_i=0 AND (j & 1)<>0 THEN 0 ELSE 1 END;
   PERFORM pg_temp.box_assert((s->>'stage')::int=3 AND (s->>'turnIndex')::int=expected,'only qualified bonus players in original order');
   s:=s||'{"score":300000}'::jsonb;
   s:=private.boxdrop_reduce(s,'take_score',NULL,(s->>'deadline')::bigint);
   s:=private.boxdrop_reduce(s,'tick',NULL,(s->>'deadline')::bigint);count_i:=count_i+1;
   IF count_i>2 THEN RAISE EXCEPTION 'bonus loop';END IF;
  END LOOP;
  PERFORM pg_temp.box_assert(count_i=(j&1)+((j>>1)&1),'bonus awarded at most once per eligible player');
 END LOOP;
 FOR j IN 0..1 LOOP
  s:=jsonb_build_object('runId',p,'userId',u,'config',private.boxdrop_rules(),'round',2,'roundId',p||':2','status','active','score',0,'results',jsonb_build_array(jsonb_build_object('id',p||':1','stage',1,'scoreBefore',0,'score',0,'stageScore',0)));
  single:=private.boxdrop_board_deal(jsonb_build_object('rules',private.boxdrop_rules(),'score',99999+j),1000);
  single:=private.boxdrop_board_reduce(single,'take_score',NULL,3500);
  s:=private.arcade_boxdrop_finish_round(s||jsonb_build_object('board',single));
  PERFORM pg_temp.box_assert(s->>'status'=CASE WHEN j=0 THEN 'completed' ELSE 'active' END,'Arcade exact threshold controls third round');
  IF j=1 THEN
   s:=private.arcade_boxdrop_advance(s,(single->>'deadline')::bigint);
   PERFORM pg_temp.box_assert(s->>'round'='3' AND s#>>'{board,completedFirstOrders}'='0','bonus round reset');
   s:=jsonb_set(s,'{board}',private.boxdrop_board_reduce(s->'board','take_score',NULL,(s#>>'{board,deadline}')::bigint));
   s:=private.arcade_boxdrop_finish_round(s);
   PERFORM pg_temp.box_assert(s->>'status'='completed','third round cannot earn a fourth');
  END IF;
 END LOOP;
END $$;
SELECT 'Boxdrop: 20 autonomous bot rounds, deterministic cross-mode parity, all bonus eligibility schedules PASS' AS proof;
