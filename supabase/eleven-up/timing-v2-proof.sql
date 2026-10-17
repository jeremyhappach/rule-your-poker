-- Run after production-proof.sql, inside the same rollback transaction.
DO $$
DECLARE old_b jsonb; new_b jsonb; v jsonb;
BEGIN
 PERFORM pg_temp.eleven_assert(private.eleven_up_rules_v2()-ARRAY['version','stageMs']=private.eleven_up_rules()-ARRAY['version','stageMs'],'only version and play duration change');
 PERFORM pg_temp.eleven_assert(private.eleven_up_rules()->>'version'='eleven-up/1' AND private.eleven_up_rules()->>'stageMs'='120000','v1 remains frozen');
 PERFORM pg_temp.eleven_assert(private.eleven_up_rules_v2()->>'version'='eleven-up/2' AND private.eleven_up_rules_v2()->>'stageMs'='180000','v2 has three minutes');
 PERFORM pg_temp.eleven_assert(private.eleven_up_admission_rules()=private.eleven_up_rules_v2(),'multiplayer and Arcade share new default');
 PERFORM pg_temp.eleven_assert(private.arcade_score_group('eleven-up','eleven-up/1')<>private.arcade_score_group('eleven-up','eleven-up/2'),'separate duration leaderboards');
 old_b:=private.eleven_up_board_deal(jsonb_build_object('rules',private.eleven_up_rules(),'score',0),0);
 new_b:=old_b||jsonb_build_object('rules',private.eleven_up_rules_v2());
 PERFORM pg_temp.eleven_assert(new_b->>'deadline'='2500','bell still 2.5 seconds');
 v:=private.eleven_up_board_reduce(new_b,'tick',NULL,2500);
 PERFORM pg_temp.eleven_assert(v->>'phase'='ready' AND v->>'deadline'='32500','ready still 30 seconds');
 v:=private.eleven_up_board_reduce(v,'tick',NULL,32500);
 PERFORM pg_temp.eleven_assert(v#>>'{result,reason}'='ready_timeout','ready expiry unchanged');
 old_b:=private.eleven_up_board_reduce(old_b,'pass',NULL,3000);
 new_b:=private.eleven_up_board_reduce(new_b,'pass',NULL,3000);
 PERFORM pg_temp.eleven_assert(old_b->>'deadline'='123000' AND new_b->>'deadline'='183000','frozen first-action clocks');
 PERFORM pg_temp.eleven_assert(private.eleven_up_board_reduce(old_b,'tick',NULL,123000)#>>'{result,reason}'='timeout','existing v1 expires at two minutes');
 PERFORM pg_temp.eleven_assert(private.eleven_up_board_reduce(new_b,'tick',NULL,123000)->>'phase'='playing','new v2 continues beyond two minutes');
 PERFORM pg_temp.eleven_assert(private.eleven_up_board_reduce(new_b,'tick',NULL,182999)->>'phase'='playing','last millisecond remains playable');
 v:=private.eleven_up_board_reduce(new_b,'take_score',NULL,183000);
 PERFORM pg_temp.eleven_assert(v#>>'{result,reason}'='timeout' AND v#>>'{result,completedAt}'='183000' AND v->>'deadline'='188000','deadline wins action race and keeps five-second results');
 v:=private.eleven_up_board_reduce(new_b,'take_score',NULL,123000);
 PERFORM pg_temp.eleven_assert(v#>>'{result,timeBonus}'='0','speed still reaches zero at two minutes');
 v:=private.eleven_up_board_reduce(new_b,'take_score',NULL,122999);
 PERFORM pg_temp.eleven_assert(v#>>'{result,timeBonus}'='100','speed arithmetic remains unchanged');
END $$;
SELECT 'eleven-up v1/v2 timing proof passed' AS proof;
