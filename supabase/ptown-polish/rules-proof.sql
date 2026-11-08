BEGIN;
SET LOCAL statement_timeout='60s';
-- CANDIDATE_DDL
CREATE FUNCTION pg_temp.polish_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Polish: %',label;END IF;END$$;
DO $$
DECLARE cfg jsonb:=private.horses_blitz_rules('horses-blitz/4');item record;r jsonb;s jsonb;t jsonb;lanes jsonb;roll_i integer;rank_i integer;size_i integer;
 bases jsonb:='[[25,25,25,25,25],[35,43,52,63,76],[135,165,200,245,300],[380,460,560,680,820],[1000,1210,1460,1760,2120]]';
BEGIN
 PERFORM pg_temp.polish_check(cfg->'matrix'=bases AND cfg->>'durationMs'='180000','frozen matrix and three-minute duration');
 FOR item IN SELECT * FROM (VALUES ('[2,3,4,5,6]',33,false),('[1,6,2,3,4]',99,false),('[6,6,2,3,4]',119,true),('[4,4,4,2,6]',312,true),('[1,1,1,1,1]',4056,true)) x(dice,points,natty) LOOP
  r:=private.horses_blitz_set(item.dice::jsonb,1,cfg);
  PERFORM pg_temp.polish_check((r->>'points')::int=item.points AND (r->>'natural')::boolean=item.natty,'exact sample '||item.dice);
 END LOOP;
 FOR roll_i IN 1..3 LOOP
  PERFORM pg_temp.polish_check((private.horses_blitz_set('[1,1,1,1,1]',roll_i,cfg)->>'points')::int>(private.horses_blitz_set('[6,6,6,6,6]',roll_i,cfg)->>'points')::int,'actual five ones tops natural sixes');
  FOR size_i IN 2..5 LOOP FOR rank_i IN 0..3 LOOP
   PERFORM pg_temp.polish_check(round((bases->(size_i-1)->>rank_i)::numeric*1.2*(CASE roll_i WHEN 1 THEN 1.3 WHEN 2 THEN 1.1 ELSE 1 END))
    <=round((bases->(size_i-1)->>(rank_i+1))::numeric*(CASE roll_i WHEN 1 THEN 1.3 WHEN 2 THEN 1.1 ELSE 1 END)),'rank precedence with approved rounded ties after natural bonus');
  END LOOP;END LOOP;
  FOR size_i IN 1..4 LOOP
   PERFORM pg_temp.polish_check(round((bases->(size_i-1)->>4)::numeric*(CASE WHEN size_i=1 THEN 1 ELSE 1.2 END)*(CASE roll_i WHEN 1 THEN 1.3 WHEN 2 THEN 1.1 ELSE 1 END))
    <round((bases->size_i->>0)::numeric*(CASE roll_i WHEN 1 THEN 1.3 WHEN 2 THEN 1.1 ELSE 1 END)),'meld precedence after natural bonus');
  END LOOP;
 END LOOP;
 s:=private.horses_blitz_round(jsonb_build_object('runId',gen_random_uuid(),'config',cfg,'status','active','round',0,'score',0,'results','[]'::jsonb),1000000);
 PERFORM pg_temp.polish_check((s->>'deadline')::bigint-(s->>'startedAt')::bigint=180000 AND s->>'roll'='0','manual opening and duration');
 s:=private.horses_blitz_action(s,'roll','{}',1000001);
 s:=s||jsonb_build_object('dice','[2,3,4,5,6]'::jsonb,'set',private.horses_blitz_set('[2,3,4,5,6]',1,cfg));
 PERFORM pg_temp.polish_check(private.horses_blitz_action(s,'bank','{}',1000002)->>'base'='33','high-card offer is bankable');
 s:=private.horses_blitz_action(s,'roll',ARRAY[0,1,2,3,4],1000002);s:=private.horses_blitz_action(s,'roll',ARRAY[0,1,2,3,4],1000003);
 PERFORM pg_temp.polish_check(s->>'phase'='playing' AND s->>'base'='0' AND s#>>'{set,points}'='25','third roll waits and retains offer');
 BEGIN PERFORM private.horses_blitz_action(s,'roll','{}',1000004);RAISE EXCEPTION 'fourth roll accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'horses_blitz:illegal_action' THEN RAISE;END IF;END;
 PERFORM pg_temp.polish_check(private.horses_blitz_action(s,'bank','{}',1000004)->>'base'='25','manual final bank');
 -- Pair of jacks in the 5s row is a completed zero-score row, still eligible to carry.
 lanes:=jsonb_build_array(private.drop357_lane(ARRAY[9,22,12],3),private.drop357_lane(ARRAY[9,22,12,6,1],5),private.drop357_lane(ARRAY[0,13,26,39,2,4,6],7));
 s:=jsonb_build_object('status','active','config',(SELECT config FROM private.arcade_rulesets WHERE id='357-drop/5'),'deadline',1120000,'laneResults',lanes);
 t:=private.drop357_finish(s,1010000,'filled');
 PERFORM pg_temp.polish_check(lanes#>>'{1,score}'='0' AND t#>>'{result,allBonus}'='0' AND t#>>'{result,reason}'='filled','jacks: tally without award');
 lanes:=jsonb_set(lanes,'{1}',private.drop357_lane(ARRAY[9,22,10,23,12],5));
 s:=s||jsonb_build_object('laneResults',lanes);t:=private.drop357_finish(s,1010000,'filled');
 PERFORM pg_temp.polish_check(t#>>'{result,allBonus}'='500' AND (t#>>'{result,base}')::int=(SELECT sum((x->>'score')::int)+500 FROM jsonb_array_elements(lanes)x),'qualifying board awards exactly 500 once');
 PERFORM pg_temp.polish_check(private.drop357_finish(t,1010001,'filled')=t,'bonus replay');
 PERFORM pg_temp.polish_check(private.drop357_finish(jsonb_set(s,'{config}',(SELECT config FROM private.arcade_rulesets WHERE id='357-drop/4')),1010000,'filled')#>>'{result,allBonus}'='200','old bonus frozen');
END$$;
SELECT 'PASS: exact offers, priority, manual banking, duration, jacks and qualifying ALL FILLED' result;
ROLLBACK;
