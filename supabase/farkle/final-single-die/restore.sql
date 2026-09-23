-- Executable forward recovery for the final-single-die correction.
-- Run only after Farkle creation is disabled and active games are quiescent.
BEGIN;
DO $guard$
BEGIN
  PERFORM pg_advisory_xact_lock(19092026,1);
  IF md5(pg_get_functiondef('private.farkle_reduce_v1(jsonb,text,jsonb,integer[])'::regprocedure)) <> '5b18d6eda51a21868ab7d10645beae13'
  THEN RAISE EXCEPTION 'farkle_final_single_die_restore:reducer_candidate_drift'; END IF;
  IF md5(pg_get_functiondef('public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)'::regprocedure)) <> '54b2ef0f284857e4df624f967f732f95'
  THEN RAISE EXCEPTION 'farkle_final_single_die_restore:action_candidate_drift'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION private.farkle_reduce_v1(s jsonb, action text, selection jsonb, rolled integer[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE config jsonb:=s->'config'; dice jsonb:='[]'; legal jsonb; hold jsonb; available jsonb; i integer; event jsonb;
BEGIN
 IF s->>'version' IS DISTINCT FROM '1' OR s->>'gamePhase' IS DISTINCT FROM 'playing' THEN RAISE EXCEPTION 'farkle:not_playing'; END IF;
 s:=s||jsonb_build_object('events','[]'::jsonb,'actionSequence',(s->>'actionSequence')::bigint+1);
 IF action='roll' THEN
  IF s->>'stage' NOT IN ('roll','bank_or_roll') OR cardinality(rolled) IS DISTINCT FROM jsonb_array_length(s->'available')
  OR EXISTS(SELECT 1 FROM unnest(rolled) v WHERE v IS NULL OR v NOT BETWEEN 1 AND 6)
  THEN RAISE EXCEPTION 'farkle:illegal_roll'; END IF;
  FOR i IN 0..cardinality(rolled)-1 LOOP dice:=dice||jsonb_build_array(jsonb_build_object('index',s->'available'->i,'value',rolled[i+1])); END LOOP;
  legal:=private.farkle_legal_holds_v1(dice,config->'rules');
  event:=jsonb_build_object('type','dice_rolled','playerId',s->'currentTurnPlayerId','dice',dice,'rollNumber',(s->>'rollNumber')::integer+1,'scoringCycle',s->'scoringCycle');
  s:=s||jsonb_build_object('dice',dice,'legalHolds',legal,'rollNumber',(s->>'rollNumber')::integer+1,'stage','hold','events',jsonb_build_array(event));
  IF legal='[]'::jsonb THEN
   s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','farkle','playerId',s->'currentTurnPlayerId','lost',s->'thisTurn')));
   s:=private.farkle_finish_turn_v1(s,false);
  END IF;
 ELSIF action='hold' THEN
  IF s->>'stage'<>'hold' OR jsonb_typeof(selection) IS DISTINCT FROM 'array' OR jsonb_array_length(selection)=0
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection) v WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[0-5]$')
  OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(selection))<>jsonb_array_length(selection)
  THEN RAISE EXCEPTION 'farkle:illegal_hold'; END IF;
  SELECT jsonb_agg(value::integer ORDER BY value::integer) INTO selection FROM jsonb_array_elements_text(selection);
  SELECT value INTO hold FROM jsonb_array_elements(s->'legalHolds') WHERE value->'indexes'=selection;
  IF hold IS NULL THEN RAISE EXCEPTION 'farkle:non_scoring_selection'; END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO available FROM jsonb_array_elements(s->'available') WITH ORDINALITY WHERE NOT selection @> jsonb_build_array(value);
  s:=s||jsonb_build_object('thisTurn',(s->>'thisTurn')::bigint+(hold->>'points')::bigint,'available',available,'stage','bank_or_roll','legalHolds','[]'::jsonb);
  event:=jsonb_build_object('type','dice_held','playerId',s->'currentTurnPlayerId','indexes',selection,'points',hold->'points','thisTurn',s->'thisTurn','rollNumber',s->'rollNumber');
  s:=jsonb_set(s,'{events}',jsonb_build_array(event));
  IF available='[]'::jsonb THEN
   s:=s||jsonb_build_object('available',jsonb_build_array(0,1,2,3,4,5),'scoringCycle',(s->>'scoringCycle')::integer+1);
   s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','hot_dice','thisTurn',s->'thisTurn','scoringCycle',s->'scoringCycle')));
  END IF;
 ELSIF action='bank' THEN
  IF s->>'stage'<>'bank_or_roll' OR (s->>'thisTurn')::bigint<=0 THEN RAISE EXCEPTION 'farkle:illegal_bank'; END IF;
  s:=jsonb_set(s,'{events}',jsonb_build_array(jsonb_build_object('type','banked','playerId',s->'currentTurnPlayerId','points',s->'thisTurn')));
  s:=private.farkle_finish_turn_v1(s,true);
 ELSE RAISE EXCEPTION 'farkle:unknown_action'; END IF;
 RETURN s;
END $function$;
COMMIT;
