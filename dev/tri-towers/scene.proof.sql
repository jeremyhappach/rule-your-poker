DO $$
DECLARE v2 jsonb;v3 jsonb;b jsonb;r jsonb;t bigint:=1000;i integer;
BEGIN
 SELECT config INTO v2 FROM private.arcade_rulesets WHERE id='tri-towers/2';
 SELECT config INTO v3 FROM private.arcade_rulesets WHERE id='tri-towers/3';
 ASSERT v2-'version'=v3-'version'-'roundIntroMs','scoring configuration incompatibility';
 ASSERT private.arcade_score_group('tri-towers','tri-towers/2')=private.arcade_score_group('tri-towers','tri-towers/3'),'explicit compatibility';
 ASSERT private.arcade_score_group('run21','run21/4')='run21/4','Run21 isolation';
 b:=private.tri_towers_board_deal(jsonb_build_object('rules',v3,'score',0),t);
 ASSERT b->>'phase'='intro' AND (b->>'deadline')::bigint=3500,'exact intro deadline';
 ASSERT private.tri_towers_board_reduce(b,'tick',NULL,3499)=b,'early intro tick';
 BEGIN PERFORM private.tri_towers_board_reduce(b,'draw',NULL,3499);RAISE EXCEPTION 'early draw admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri_towers:round_intro' THEN RAISE;END IF;END;
 r:=private.tri_towers_board_reduce(b,'tick',NULL,3500);
 ASSERT r->>'phase'='ready' AND (r->>'deadline')::bigint=33500,'full Ready after intro';
 ASSERT r->'deck'=b->'deck','intro never redeals';
 r:=private.tri_towers_board_reduce(b,'tick',NULL,5000);
 ASSERT (r->>'deadline')::bigint=33500,'late worker does not extend Ready';
 r:=private.tri_towers_board_reduce(b,'draw',NULL,3500);
 ASSERT r->>'phase'='playing' AND (r->>'deadline')::bigint=123500,'first valid action gets full playing duration';
 r:=private.tri_towers_board_reduce(b,'tick',NULL,33500);
 ASSERT r->>'phase'='stage_complete' AND (r->>'deadline')::bigint=38500,'zero-client Ready expiry and unchanged hold';
 ASSERT r#>>'{result,timeBonus}'='0','Ready expiry no time bonus';
 FOR i IN 0..15 LOOP
  b:=jsonb_set(private.tri_towers_board_deal(jsonb_build_object('rules',v2,'score',10000),t),'{phase}','"playing"');
  b:=b||jsonb_build_object('deck',(SELECT jsonb_agg(n) FROM generate_series(0,51)n),'removed','[]'::jsonb,'waste',4,'run',i,'deadline',121000);
  r:=jsonb_set(b,'{rules}',v3);
  ASSERT private.tri_towers_board_reduce(b,'remove',18,1000)-'rules'=private.tri_towers_board_reduce(r,'remove',18,1000)-'rules','streak score parity';
  ASSERT private.tri_towers_board_reduce(b,'draw',NULL,1000)-'rules'=private.tri_towers_board_reduce(r,'draw',NULL,1000)-'rules','draw parity';
  ASSERT private.tri_towers_board_reduce(b,'take_score',NULL,119001)-'rules'=private.tri_towers_board_reduce(r,'take_score',NULL,119001)-'rules','whole seconds parity';
 END LOOP;
END $$;
