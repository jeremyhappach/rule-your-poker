-- Run in a transaction, after authority.sql for the candidate proof, then ROLLBACK.
-- Pure JSON reducer/policy inputs only: no session, player, event or money rows.
CREATE OR REPLACE FUNCTION pg_temp.farkle_policy_assert(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_policy_proof:%',label; END IF; END $$;

DO $proof$
DECLARE
 a text:='00000000-0000-4000-8000-000000000001';
 b text:='00000000-0000-4000-8000-000000000002';
 c jsonb:='{"version":1,"targetScore":10000,"endgame":"equal_turns","botPolicy":"balanced","botBankThreshold":500,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[1000,1000,1000,1000,1000,1000],"5":[2000,2000,2000,2000,2000,2000],"6":[3000,3000,3000,3000,3000,3000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}';
 s jsonb; hot jsonb; ordinary jsonb; decisive jsonb; result jsonb; choice jsonb; mode text;
BEGIN
 s:=private.farkle_new_state_v1(jsonb_build_array(a,b),c,'00000000-0000-4000-8000-000000000003');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(s)->>'action'='roll','opening roll');
 -- Reach exactly 500 and HOT DICE through real, unchanged scoring and Hold rules.
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,2]);
 choice:=private.farkle_bot_action_v1(s);
 PERFORM pg_temp.farkle_policy_assert(choice=jsonb_build_object('action','hold','selection','[0,1]'::jsonb),'best Hold unchanged');
 s:=private.farkle_reduce_v1(s,'hold',choice->'selection');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(s)->>'action'='roll','ordinary below threshold');
 ordinary:=jsonb_set(s,'{thisTurn}','500');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(ordinary)->>'action'='bank','ordinary 500 banks');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3]);
 s:=private.farkle_reduce_v1(s,'hold','[2,3]');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,1]);
 hot:=private.farkle_reduce_v1(s,'hold','[4,5]');
 PERFORM pg_temp.farkle_policy_assert(hot->>'thisTurn'='500' AND hot->>'scoringCycle'='2'
  AND hot->'available'='[0,1,2,3,4,5]'::jsonb,'real Hot Dice 500 fixture');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(hot)->>'action'='roll','Hot Dice 500 rolls');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(hot)=private.farkle_bot_action_v1(hot),'duplicate and replay deterministic');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(hot||'{"events":[]}'::jsonb)->>'action'='roll','recovered state needs no transient event');
 s:=private.farkle_reduce_v1(hot,'roll','[]',ARRAY[1,2,3,4,5,6]);
 s:=private.farkle_reduce_v1(s,'hold','[0,1,2,3,4,5]');
 PERFORM pg_temp.farkle_policy_assert(s->>'scoringCycle'='3' AND private.farkle_bot_action_v1(s)->>'action'='roll','repeated Hot Dice rolls');
 s:=private.farkle_reduce_v1(hot,'roll','[]',ARRAY[5,2,3,4,6,2]);
 s:=private.farkle_reduce_v1(s,'hold','[0]');
 PERFORM pg_temp.farkle_policy_assert(s->>'thisTurn'='550' AND private.farkle_bot_action_v1(s)->>'action'='bank','normal policy resumes after fresh roll and partial Hold');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(hot)->>'action'='roll','late replay unaffected by successor');
 -- Automatic final-die Hold follows the same policy path.
 s:=ordinary||'{"stage":"bank_or_roll","thisTurn":450,"available":[5]}'::jsonb;
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[5]);
 PERFORM pg_temp.farkle_policy_assert(s->>'thisTurn'='500' AND private.farkle_bot_action_v1(s)->>'action'='roll','auto Hold Hot Dice rolls');
 FOREACH mode IN ARRAY ARRAY['immediate','equal_turns','one_last_turn'] LOOP
  decisive:=jsonb_set(jsonb_set(hot,ARRAY['playerStates',a,'banked'],'9500'),'{config,endgame}',to_jsonb(mode));
  PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(decisive)->>'action'='bank','target Bank '||mode);
  result:=private.farkle_reduce_v1(decisive,'bank','[]');
  PERFORM pg_temp.farkle_policy_assert(result->'playerStates'->a->>'banked'='10000','target credited '||mode);
  PERFORM pg_temp.farkle_policy_assert((mode='immediate' AND result->>'gamePhase'='complete') OR
   (mode<>'immediate' AND result->>'gamePhase'='playing' AND result->'finalQueue'=jsonb_build_array(b)),'terminal or continuation preserved '||mode);
 END LOOP;
 decisive:=jsonb_set(jsonb_set(hot,ARRAY['playerStates',a,'banked'],'9600'),ARRAY['playerStates',b,'banked'],'10000')
  ||jsonb_build_object('finalQueue',jsonb_build_array(a),'targetReachedBy',b);
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(decisive)->>'action'='bank','winning final-turn Bank');
 result:=private.farkle_reduce_v1(decisive,'bank','[]');
 PERFORM pg_temp.farkle_policy_assert(result->>'winnerPlayerId'=a AND result->>'gamePhase'='complete','final-turn winner unchanged');
 decisive:=jsonb_set(decisive,'{tiebreakTurn}','1');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(decisive)->>'action'='bank','winning tiebreak Bank');
 result:=private.farkle_reduce_v1(decisive,'bank','[]');
 PERFORM pg_temp.farkle_policy_assert(result->>'winnerPlayerId'=a AND result->>'gamePhase'='complete','tiebreak terminal unchanged');
 decisive:=jsonb_set(decisive,ARRAY['playerStates',a,'banked'],'9500');
 result:=private.farkle_reduce_v1(decisive,'bank','[]');
 PERFORM pg_temp.farkle_policy_assert(result->>'gamePhase'='playing' AND result->>'tiebreakTurn'='2' AND jsonb_array_length(result->'eligible')=2,'tie still starts another tiebreak');
 -- Winning Bank below the ordinary threshold still takes precedence.
 decisive:=jsonb_set(jsonb_set(decisive,ARRAY['playerStates',a,'banked'],'10000'),'{thisTurn}','50');
 PERFORM pg_temp.farkle_policy_assert(private.farkle_bot_action_v1(decisive)->>'action'='bank','below-threshold winning tiebreak Bank');
 result:=private.farkle_reduce_v1(hot,'bank','[]');
 PERFORM pg_temp.farkle_policy_assert(result->'playerStates'->a->>'banked'='500' AND result->>'currentTurnPlayerId'=b,'human Hot Dice Bank stays legal');
 result:=private.farkle_reduce_v1(hot,'roll','[]',ARRAY[1,2,3,4,6,2]);
 PERFORM pg_temp.farkle_policy_assert(jsonb_array_length(result->'dice')=6,'human Roll 6 stays legal');
 PERFORM pg_temp.farkle_policy_assert(NOT has_function_privilege('anon','private.farkle_bot_action_v1(jsonb)','EXECUTE')
  AND NOT has_function_privilege('authenticated','private.farkle_bot_action_v1(jsonb)','EXECUTE'),'private authorization preserved');
END $proof$;
SELECT 'Farkle Hot Dice policy proof passed' AS result;
