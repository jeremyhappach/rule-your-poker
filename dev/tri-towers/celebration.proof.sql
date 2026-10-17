-- Always run inside BEGIN/ROLLBACK; no historical sessions are touched.
DO $$
DECLARE v3 jsonb;v4 jsonb;b jsonb;r jsonb;legacy jsonb;s jsonb;next_s jsonb;i integer;n integer;players jsonb;
BEGIN
 SELECT config INTO v3 FROM private.arcade_rulesets WHERE id='tri-towers/3';
 SELECT config INTO v4 FROM private.arcade_rulesets WHERE id='tri-towers/4';
 ASSERT v3-'version'=v4-'version'-'clearCelebrationMs','identical scoring, dealing, qualification and full playing clocks';
 ASSERT private.arcade_score_group('tri-towers','tri-towers/4')='tri-towers/2','combined leaderboard/PB';
 b:=private.tri_towers_board_deal(jsonb_build_object('rules',v4,'score',0),1000);
 ASSERT b->>'phase'='intro' AND (b->>'deadline')::bigint=3500,'unchanged intro';
 r:=private.tri_towers_board_reduce(b,'tick',NULL,3500);
 ASSERT r->>'phase'='ready' AND (r->>'deadline')::bigint=33500,'full Ready';
 r:=private.tri_towers_board_reduce(b,'draw',NULL,3500);
 ASSERT r->>'phase'='playing' AND (r->>'deadline')::bigint=123500,'full playing clock';
 b:=r||jsonb_build_object('deck',(SELECT jsonb_agg(x) FROM generate_series(0,51)x),'removed',(SELECT jsonb_agg(x) FROM generate_series(1,27)x),'waste',12,'cursor',29,'run',0,'score',0,'scoreBefore',0,'deadline',121000);
 r:=private.tri_towers_board_reduce(b,'remove',0,1000);
 legacy:=private.tri_towers_board_reduce(jsonb_set(b,'{rules}',v3),'remove',0,1000);
 ASSERT r-'rules'-'deadline'=legacy-'rules'-'deadline','all awards and result identical to v3';
 ASSERT (r->>'deadline')::bigint=9000 AND (legacy->>'deadline')::bigint=6000,'only v4 clear gets 3+5 seconds';
 ASSERT r#>>'{result,timeBonus}'='1200' AND r#>>'{result,stockBonus}'='23000' AND r->>'score'='39300','unchanged whole-second time/stock/tower awards';
 BEGIN PERFORM private.tri_towers_board_reduce(r,'tick',NULL,2000);RAISE EXCEPTION 'finished board accepted tick';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='tri_towers:phase';END;
 FOR i IN 0..15 LOOP
  b:=b||jsonb_build_object('removed','[]'::jsonb,'waste',4,'run',i);
  ASSERT private.tri_towers_board_reduce(b,'remove',18,1000)-'rules'=private.tri_towers_board_reduce(jsonb_set(b,'{rules}',v3),'remove',18,1000)-'rules','streak parity';
  ASSERT private.tri_towers_board_reduce(b,'draw',NULL,1000)-'rules'=private.tri_towers_board_reduce(jsonb_set(b,'{rules}',v3),'draw',NULL,1000)-'rules','draw parity';
 END LOOP;
 legacy:=private.tri_towers_board_reduce(b,'take_score',NULL,119001);
 ASSERT (legacy->>'deadline')::bigint=124001,'non-clear stays five seconds';
 FOR n IN 2..7 LOOP
  SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'userId',gen_random_uuid(),'seat',x,'name','Proof')) INTO players FROM generate_series(1,n)x;
  s:=r||jsonb_build_object('players',players,'scores',jsonb_build_object(players->0->>'id',39300),'stages','[]'::jsonb,'stage',1,'turnIndex',0);
  ASSERT private.tri_towers_reduce(s,'tick',NULL,8999)=s,'multiplayer cannot progress during celebration+normal hold';
  next_s:=private.tri_towers_reduce(s,'tick',NULL,9000);
  ASSERT next_s->>'phase'='intro' AND next_s->>'turnIndex'='1' AND next_s->>'deadline'='11500','next participant begins at exact extended deadline';
 END LOOP;
 s:=jsonb_build_object('runId',gen_random_uuid(),'round',1,'roundId','one','status','active','config',v4,'score',39300,'results','[]'::jsonb,'board',r);
 ASSERT private.arcade_tri_advance(s,8999)=s,'Arcade no early advance';
 next_s:=private.arcade_tri_advance(s,9000);
 ASSERT next_s->>'round'='2' AND next_s#>>'{board,phase}'='intro' AND next_s#>>'{board,deadline}'='11500','Arcade exact boundary';
 next_s:=private.arcade_tri_advance(s,12000);
 ASSERT next_s#>>'{board,phase}'='ready' AND next_s#>>'{board,deadline}'='41500','late worker catches up without added time';
END $$;

-- The legacy compatibility proof defines tri_finish using the actual immutable writer.
DO $$DECLARE a uuid:=gen_random_uuid();r jsonb;old_id uuid;new_id uuid;BEGIN
 INSERT INTO auth.users(id) VALUES(a);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Celebration compatibility proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_rulesets SET enabled=false WHERE id='tri-towers/4';
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/3';
 r:=pg_temp.tri_finish(a,12000);old_id:=(r->>'id')::uuid;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/4';
 r:=pg_temp.tri_finish(a,12000);new_id:=(r->>'id')::uuid;
 ASSERT (SELECT ruleset FROM private.arcade_results WHERE run_id=new_id)='tri-towers/4','result retains frozen v4';
 ASSERT (SELECT record->>'kind' FROM private.arcade_results WHERE run_id=new_id)='matched','v4 compares v3 PB';
 r:=pg_temp.tri_finish(a,13000);
 ASSERT (SELECT record->>'kind' FROM private.arcade_results WHERE run_id=(r->>'id')::uuid)='broken','v4 breaks shared PB';
 ASSERT public.arcade_leaderboard(a,'tri-towers','all',old_id,'tri-towers/2')->>'personalBest'='13000','legacy query combines v4';
 ASSERT jsonb_array_length(public.arcade_leaderboard(a,'tri-towers','all',new_id)->'availableRulesets')=1,'one leaderboard';
END $$;
