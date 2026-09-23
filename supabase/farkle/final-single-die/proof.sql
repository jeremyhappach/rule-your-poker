-- Run inside the candidate migration's rollback transaction.
-- All rules/configuration here are TEST ONLY.
CREATE FUNCTION pg_temp.farkle_final_die_assert(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $assert$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_final_die_proof:%', label; END IF;
END $assert$;

DO $proof$
DECLARE
  config jsonb:='{"version":1,"testOnly":true,"testLabel":"TEST ONLY: final single die proof","ante_amount":1,"targetScore":10000,"endgame":"equal_turns","turnSeconds":60,"botDelayMs":2000,"botPolicy":"balanced","botBankThreshold":500,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[1000,1000,1000,1000,1000,1000],"5":[2000,2000,2000,2000,2000,2000],"6":[3000,3000,3000,3000,3000,3000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}'::jsonb;
  ids jsonb:=jsonb_build_array(gen_random_uuid(),gen_random_uuid()); s jsonb; events jsonb;
BEGIN
  PERFORM pg_temp.farkle_final_die_assert(
    strpos(pg_get_functiondef('public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)'::regprocedure),'event->>''type''=''hot_dice''')>0
    AND strpos(pg_get_functiondef('public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)'::regprocedure),'p_action=''hold'' AND EXISTS')=0,
    'authoritative HOT DICE renewal admits the automatic Roll verb');
  s:=private.farkle_new_state_v1(ids,config,gen_random_uuid())||jsonb_build_object('available',jsonb_build_array(4));
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1]); events:=s->'events';
  PERFORM pg_temp.farkle_final_die_assert(s->>'thisTurn'='100' AND s->>'stage'='bank_or_roll'
    AND s->'available'='[0,1,2,3,4,5]'::jsonb AND s->>'scoringCycle'='2','one die 1 auto scores and hot dice resets');
  PERFORM pg_temp.farkle_final_die_assert(
    (SELECT count(*) FROM jsonb_array_elements(events) e WHERE e->>'type' IN ('dice_rolled','dice_held','hot_dice'))=3
    AND (SELECT e->>'points' FROM jsonb_array_elements(events) e WHERE e->>'type'='dice_held')='100'
    AND (SELECT e->'indexes' FROM jsonb_array_elements(events) e WHERE e->>'type'='dice_held')='[4]'::jsonb,
    'one die 1 emits the normal roll hold hot-dice receipt');

  s:=private.farkle_new_state_v1(ids,config,gen_random_uuid())||jsonb_build_object('available',jsonb_build_array(2));
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[5]); events:=s->'events';
  PERFORM pg_temp.farkle_final_die_assert(s->>'thisTurn'='50' AND s->>'stage'='bank_or_roll'
    AND s->'available'='[0,1,2,3,4,5]'::jsonb AND s->>'scoringCycle'='2','one die 5 auto scores and hot dice resets');
  PERFORM pg_temp.farkle_final_die_assert((SELECT e->>'points' FROM jsonb_array_elements(events) e WHERE e->>'type'='dice_held')='50',
    'one die 5 records its configured hold points');

  s:=private.farkle_new_state_v1(ids,config,gen_random_uuid())||jsonb_build_object('available',jsonb_build_array(1));
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2]); events:=s->'events';
  PERFORM pg_temp.farkle_final_die_assert(s->>'thisTurn'='0' AND s->>'stage'='roll' AND s->'available'='[0,1,2,3,4,5]'::jsonb,
    'one die 2 still farkles normally');
  PERFORM pg_temp.farkle_final_die_assert(EXISTS (SELECT 1 FROM jsonb_array_elements(events) e WHERE e->>'type'='farkle')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(events) e WHERE e->>'type'='dice_held'),
    'farkle does not fabricate a hold');

  s:=private.farkle_new_state_v1(ids,config,gen_random_uuid())||jsonb_build_object('available',jsonb_build_array(0,1));
  s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5]); events:=s->'events';
  PERFORM pg_temp.farkle_final_die_assert(s->>'thisTurn'='0' AND s->>'stage'='hold' AND s->'available'='[0,1]'::jsonb,
    'multi-die scoring roll still waits for manual hold');
  PERFORM pg_temp.farkle_final_die_assert(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(events) e WHERE e->>'type' IN ('dice_held','hot_dice')),
    'multi-die roll does not auto hold');
END $proof$;
