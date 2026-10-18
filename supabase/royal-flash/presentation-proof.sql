DO $$
DECLARE b jsonb;r jsonb;done jsonb;reason text;s jsonb;solo jsonb;p uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.royal_assert(md5(pg_get_functiondef('private.royal_flash_rules()'::regprocedure))='16a94dc736a9e090f9d5118dbb8cf560','approved rules function unchanged');
 b:=private.royal_flash_board_deal(jsonb_build_object('rules',private.royal_flash_rules(),'score',1234),1000);
 b:=private.royal_flash_board_reduce(b,'place',ARRAY[0],3500);
 FOREACH reason IN ARRAY ARRAY['take_score','timeout','ready_timeout','exhausted'] LOOP
  done:=private.royal_flash_board_finish(b,reason,5000);r:=done->'result';
  PERFORM pg_temp.royal_assert(done->>'deadline'='20000' AND r->>'presentationMs'='15000','15 second authoritative hold '||reason);
  PERFORM pg_temp.royal_assert(r->'slots'=b->'slots' AND r->'lines'=b->'lines' AND jsonb_array_length(r->'lines')=10,'immutable ordered breakdown '||reason);
  PERFORM pg_temp.royal_assert(r->>'score'='1234' AND r->>'handPoints'='0' AND r->>'timeBonus'='0','partial results never invent hands/bonus '||reason);
 END LOOP;
 -- Complete-board bonus and total are unchanged; line order comes from the shared scorer.
 b:=b||jsonb_build_object('slots',(SELECT jsonb_agg(i) FROM generate_series(0,24)i));
 b:=b||jsonb_build_object('lines',private.royal_flash_lines(b->'slots',b->'rules'));
 b:=b||jsonb_build_object('handPoints',(SELECT sum((x->>'points')::bigint) FROM jsonb_array_elements(b->'lines')x));
 done:=private.royal_flash_board_finish(b,'take_score',5000);r:=done->'result';
 PERFORM pg_temp.royal_assert((r->>'timeBonus')::bigint=148*250 AND (r->>'score')::bigint=1234+(b->>'handPoints')::bigint+148*250,'full grid bonus/total preserved');
 PERFORM pg_temp.royal_assert(private.royal_flash_board_finish(b,'timeout',5000)#>>'{result,timeBonus}'='0','timeout has no bonus');
 s:=done||jsonb_build_object('players',jsonb_build_array(jsonb_build_object('id',p)),'scores',jsonb_build_object(p::text,done->'score'),'stages',jsonb_build_array(r),'turnIndex',0,'stage',1);
 PERFORM pg_temp.royal_assert(private.royal_flash_reduce(s,'tick',NULL,19999)=s,'multiplayer cannot replace board before presentation deadline');
 PERFORM pg_temp.royal_assert(private.royal_flash_reduce(s,'tick',NULL,20000)->>'stage'='2','multiplayer progresses at deadline without callback');
 solo:=jsonb_build_object('runId',p,'roundId',p||':1','round',1,'status','active','config',b->'rules','score',done->'score','board',done,'results',jsonb_build_array(r));
 PERFORM pg_temp.royal_assert(private.arcade_royal_advance(solo,19999)=solo,'Arcade cannot replace board before presentation deadline');
 PERFORM pg_temp.royal_assert(private.arcade_royal_advance(solo,20000)->>'round'='2','Arcade progresses at deadline without callback');
END $$;
SELECT 'presentation PASS: frozen rules, exact result lines/cards, 15s server hold, partial/timeout/exhaustion/bonus totals' AS proof;
