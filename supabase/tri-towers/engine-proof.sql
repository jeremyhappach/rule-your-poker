-- Run against the engine functions relocated into pg_temp, inside BEGIN/ROLLBACK.
-- No application tables, authentication records or money are touched.
CREATE FUNCTION pg_temp.check_tri(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri_towers_proof:%',label;END IF;END $$;
DO $$
DECLARE s jsonb; t jsonb; original jsonb; deck jsonb:=(SELECT jsonb_agg(q.card) FROM generate_series(0,51)q(card));
 players jsonb:='[{"id":"p1","userId":"u1","seat":2,"name":"One"},{"id":"p2","userId":"u2","seat":1,"name":"Two"}]';
 i integer; step_i integer:=0; now_ms bigint:=0; action text; idx integer; first_deck jsonb;
BEGIN
 original:=pg_temp.tri_towers_deal(jsonb_build_object('identity',jsonb_build_object('sessionId','s','dealerGameId','d','roundId','r'),
  'players',players,'rules',pg_temp.tri_towers_rules(),'turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb),0);
 FOR i IN 1..20 LOOP
  t:=pg_temp.tri_towers_shuffle();PERFORM pg_temp.check_tri(jsonb_array_length(t)=52 AND (SELECT count(DISTINCT x) FROM jsonb_array_elements(t)x)=52,'secure_unique_deck');
 END LOOP;
 s:=original||jsonb_build_object('deck',deck,'waste',28);
 PERFORM pg_temp.check_tri((SELECT count(*) FROM generate_series(0,27)q(card) WHERE pg_temp.tri_towers_exposed(s,q.card))=10,'bottom_ten');
 PERFORM pg_temp.check_tri(NOT(pg_temp.tri_towers_visible(s)?'deck') AND (SELECT count(*) FROM jsonb_array_elements(pg_temp.tri_towers_visible(s)->'cards')c WHERE c<>'null'::jsonb)=10,'hidden_redaction');
 s:=pg_temp.tri_towers_reduce(s,'start',NULL,0);
 BEGIN PERFORM pg_temp.tri_towers_reduce(s,'remove',0,1);RAISE EXCEPTION 'accepted_covered';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri_towers:illegal_move' THEN RAISE;END IF;END;
 s:=s||jsonb_build_object('waste',17);s:=pg_temp.tri_towers_reduce(s,'remove',18,1);s:=pg_temp.tri_towers_reduce(s,'remove',19,2);
 PERFORM pg_temp.check_tri((s->>'score')::integer=3000 AND pg_temp.tri_towers_exposed(s,9),'run_score_and_exposure');
 s:=pg_temp.tri_towers_reduce(s,'draw',NULL,3);PERFORM pg_temp.check_tri(s->>'run'='0' AND s->>'cursor'='30','draw_resets');
 -- Deterministic last-peak fixture proves wrap, peak/time awards and stage caps.
 s:=original||jsonb_build_object('deck',deck,'phase','playing','deadline',120000,'waste',12,'removed',(SELECT jsonb_agg(q.card) FROM generate_series(1,27)q(card)));
 PERFORM pg_temp.check_tri(pg_temp.tri_towers_legal(s,0),'ace_king_wrap');
 t:=pg_temp.tri_towers_reduce(s,'remove',0,20000);
 PERFORM pg_temp.check_tri(t->>'score'='26000' AND t->>'phase'='stage_complete' AND t->>'turnIndex'='0','last_peak_and_whole_second_clear_bonus');
 PERFORM pg_temp.check_tri(pg_temp.tri_towers_reduce(t,'continue',NULL,20001)=t,'legacy_continue_cannot_skip_hold');
 t:=pg_temp.tri_towers_reduce(t,'tick',NULL,25000);PERFORM pg_temp.check_tri(t->>'stage'='2' AND t->>'turnIndex'='0' AND t->>'phase'='playing','second_stage_same_player');
 t:=pg_temp.tri_towers_reduce(s||'{"stage":2,"score":80000}'::jsonb,'remove',0,20000);
 PERFORM pg_temp.check_tri(t->>'phase'='stage_complete' AND t->>'turnIndex'='0','earned_bonus_stage');
 t:=pg_temp.tri_towers_reduce(t,'tick',NULL,25000);PERFORM pg_temp.check_tri(t->>'stage'='3','bonus_stage_three');
 t:=pg_temp.tri_towers_reduce(s||'{"stage":3,"score":80000}'::jsonb,'remove',0,20000);
 PERFORM pg_temp.check_tri(t->>'phase'='stage_complete' AND t->>'turnIndex'='0','final_bonus_hold');
 t:=pg_temp.tri_towers_reduce(t,'tick',NULL,25000);
 PERFORM pg_temp.check_tri(t->>'turnIndex'='1' AND t#>>'{scores,p1}'='106000' AND t->>'deadline'='55000','single_bonus_cap_and_final_score');
 s:=original||jsonb_build_object('score',1234);first_deck:=s->'deck';s:=pg_temp.tri_towers_reduce(s,'give_up',NULL,1);
 PERFORM pg_temp.check_tri(s->>'turnIndex'='1' AND s#>>'{scores,p1}'='1234' AND s->'deck'<>first_deck,'sequential_independent_final');
 s:=pg_temp.tri_towers_reduce(s,'tick',NULL,30001);PERFORM pg_temp.check_tri(s->>'phase'='complete' AND s#>>'{scores,p1}'='1234','abandonment_immutable_score');
 -- Play a complete two-human competition using only server-legal exposed moves.
 s:=original;WHILE s->>'phase'<>'complete' AND step_i<1000 LOOP
  step_i:=step_i+1;idx:=NULL;
  IF s->>'phase'='ready' THEN action:='start';ELSIF s->>'phase'='stage_complete' THEN action:='continue';
  ELSE SELECT q.card INTO idx FROM generate_series(0,27)q(card) WHERE pg_temp.tri_towers_legal(s,q.card) ORDER BY q.card LIMIT 1;action:=CASE WHEN idx IS NULL THEN 'draw' ELSE 'remove' END;END IF;
  now_ms:=CASE WHEN s->>'phase'='stage_complete' THEN (s->>'deadline')::bigint ELSE now_ms+1 END;
  s:=pg_temp.tri_towers_reduce(s,action,idx,now_ms);
 END LOOP;
 PERFORM pg_temp.check_tri(s->>'phase'='complete' AND (SELECT count(*) FROM jsonb_object_keys(s->'scores'))=2 AND jsonb_array_length(s->'stages')>=4,'complete_multiplayer');
END $$;
SELECT 'TriTowers SQL engine: unique decks, dependency graph, redaction, illegal actions, scoring, draw, independent turns, abandonment and complete two-player play passed' AS proof;
