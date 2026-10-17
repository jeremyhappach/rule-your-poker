-- Approved Ptown rules, not a claim of exact legacy Megatouch arithmetic.
-- One frozen, mode-independent rule base; no wild ball.
CREATE FUNCTION private.eleven_up_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"eleven-up/1","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"stageMs":120000,"readyMs":30000,"introMs":2500,"holdMs":5000,"clearCelebrationMs":3000,"groupBonus":1000,"clearBonus":10000,"stockPerBall":1000,"speedMax":5000,"speedStep":100,"speedStepMs":2400}'::jsonb
$$;
CREATE FUNCTION private.eleven_up_value(item integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN item BETWEEN 0 AND 15 THEN 1 WHEN item BETWEEN 16 AND 51 THEN 2+(item-16)/4 END
$$;
-- Slots 0..8 left diamond, 9..17 right, 18..21 center.
CREATE FUNCTION private.eleven_up_children(slot integer) RETURNS integer[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN slot=18 THEN ARRAY[19,20] WHEN slot IN(19,20) THEN ARRAY[21] WHEN slot=21 THEN ARRAY[]::integer[]
 ELSE ARRAY(SELECT x+CASE WHEN slot>=9 THEN 9 ELSE 0 END FROM unnest(CASE slot%9
 WHEN 0 THEN ARRAY[1,2] WHEN 1 THEN ARRAY[3,4] WHEN 2 THEN ARRAY[4,5] WHEN 3 THEN ARRAY[6]
 WHEN 4 THEN ARRAY[6,7] WHEN 5 THEN ARRAY[7] WHEN 6 THEN ARRAY[8] WHEN 7 THEN ARRAY[8] ELSE ARRAY[]::integer[] END) x) END
$$;
CREATE FUNCTION private.eleven_up_row_value(slot integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN slot IS NULL THEN NULL WHEN slot=18 THEN 600 WHEN slot IN(0,9,19,20) THEN 500 WHEN slot IN(1,2,10,11,21) THEN 400
 WHEN slot IN(3,4,5,12,13,14) THEN 300 WHEN slot IN(6,7,15,16) THEN 200 ELSE 100 END
$$;
CREATE FUNCTION private.eleven_up_unblocked(b jsonb,slot integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT slot BETWEEN 0 AND 21 AND NOT EXISTS(SELECT 1 FROM unnest(private.eleven_up_children(slot)) x WHERE b->'slots'->x<>'null'::jsonb)
$$;
CREATE FUNCTION private.eleven_up_pass_slot(b jsonb) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT x FROM unnest(ARRAY[18,0,19,20,9,1,2,21,10,11,3,4,5,12,13,14,6,7,15,16,8,17]) x
 WHERE b->'slots'->x='null'::jsonb AND private.eleven_up_unblocked(b,x) LIMIT 1
$$;
CREATE FUNCTION private.eleven_up_has_group(b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE bits integer:=1; ball integer;
BEGIN
 FOR ball IN SELECT (v#>>'{}')::integer FROM jsonb_array_elements(b->'slots') WITH ORDINALITY s(v,i)
 WHERE v<>'null'::jsonb AND private.eleven_up_unblocked(b,(i-1)::integer)
 UNION ALL SELECT (b->>'current')::integer WHERE b->'current'<>'null'::jsonb LOOP
  bits:=bits | (bits << private.eleven_up_value(ball));
  IF (bits & 2048)<>0 THEN RETURN true;END IF;
  bits:=bits & 2047;
 END LOOP;
 RETURN false;
END $$;
CREATE FUNCTION private.eleven_up_can_pass(b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT b->'current'<>'null'::jsonb AND (private.eleven_up_pass_slot(b) IS NOT NULL OR (b->>'cursor')::integer<52)
$$;
CREATE FUNCTION private.eleven_up_shuffle() RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE balls integer[]:=ARRAY(SELECT generate_series(0,51));i integer;j integer;n integer;t integer;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  LOOP n:=get_byte(extensions.gen_random_bytes(1),0);EXIT WHEN n<(256/i)*i;END LOOP;
  j:=n%i+1;t:=balls[i];balls[i]:=balls[j];balls[j]:=t;
 END LOOP;RETURN to_jsonb(balls);
END $$;
CREATE FUNCTION private.eleven_up_bonus_qualified(score bigint,rules jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT score >= (rules->>'bonusThreshold')::bigint
$$;
CREATE FUNCTION private.eleven_up_board_deal(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.eleven_up_shuffle();
BEGIN
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'slots',(SELECT jsonb_agg(deck->i ORDER BY i) FROM generate_series(0,21) i),
 'current',deck->22,'cursor',23,'groups',0,'scoreBefore',coalesce((b->>'score')::bigint,0),'phase','intro',
 'deadline',at_ms+(b#>>'{rules,introMs}')::bigint,'event',jsonb_build_object('label','11 Up','points',0));
END $$;
CREATE FUNCTION private.eleven_up_board_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE speed integer:=0;stock integer:=0;clear_i integer:=0;groups_i integer;total bigint;result jsonb;hold bigint;
BEGIN
 IF b->>'phase' NOT IN('ready','playing') THEN RAISE EXCEPTION 'eleven_up:finish_phase';END IF;
 IF reason IN('cleared','take_score','blocked') AND b ? 'startedAt' THEN
  speed:=greatest(0,(b#>>'{rules,speedMax}')::integer-(greatest(0,at_ms-(b->>'startedAt')::bigint)/(b#>>'{rules,speedStepMs}')::bigint)*(b#>>'{rules,speedStep}')::integer);
 END IF;
 IF reason='cleared' THEN
  clear_i:=(b#>>'{rules,clearBonus}')::integer;
  stock:=(52-(b->>'cursor')::integer+CASE WHEN b->'current'<>'null'::jsonb THEN 1 ELSE 0 END)*(b#>>'{rules,stockPerBall}')::integer;
 END IF;
 groups_i:=(b->>'groups')::integer*(b#>>'{rules,groupBonus}')::integer;
 total:=(b->>'score')::bigint+speed+stock+clear_i+groups_i;
 hold:=(b#>>'{rules,holdMs}')::bigint+CASE WHEN reason='cleared' THEN (b#>>'{rules,clearCelebrationMs}')::bigint ELSE 0 END;
 result:=jsonb_build_object('score',total,'scoreBefore',(b->>'scoreBefore')::bigint,'displayScore',(b->>'score')::bigint,
 'stageScore',total-(b->>'scoreBefore')::bigint,'timeBonus',speed,'stockBonus',stock,'clearBonus',clear_i,'groupBonus',groups_i,'reason',reason,'completedAt',at_ms);
 RETURN b||jsonb_build_object('score',total,'result',result,'phase','stage_complete','deadline',at_ms+hold,
 'event',jsonb_build_object('label',CASE reason WHEN 'cleared' THEN 'All balls cleared!' WHEN 'take_score' THEN 'Score taken' WHEN 'timeout' THEN 'Time expired' WHEN 'ready_timeout' THEN 'Round not started' ELSE 'No moves remaining' END,'points',speed+stock+clear_i+groups_i));
END $$;
CREATE FUNCTION private.eleven_up_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text;slot integer;ball integer;total integer:=0;points integer:=0;dest integer;cursor_i integer;uses_current boolean:=false;slots jsonb;
BEGIN
 IF b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;ELSE RAISE EXCEPTION 'eleven_up:intro';END IF;END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint,'event',jsonb_build_object('label','Make eleven or pass to start','points',0));
 END IF;
 phase:=b->>'phase';
 IF phase NOT IN('ready','playing') THEN RAISE EXCEPTION 'eleven_up:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.eleven_up_board_finish(b,CASE WHEN phase='ready' THEN 'ready_timeout' ELSE 'timeout' END,(b->>'deadline')::bigint);END IF;
 IF action='tick' THEN RETURN b;END IF;
 dest:=private.eleven_up_pass_slot(b);
 IF action='group' THEN
  IF cardinality(items) NOT BETWEEN 2 AND 11 OR cardinality(items) IS NULL OR EXISTS(SELECT 1 FROM unnest(items) x WHERE x IS NULL)
   OR cardinality(items)<>(SELECT count(DISTINCT x) FROM unnest(items) x) THEN RAISE EXCEPTION 'eleven_up:invalid_group';END IF;
  FOREACH ball IN ARRAY items LOOP
   IF b->'current'<>'null'::jsonb AND ball=(b->>'current')::integer THEN uses_current:=true;points:=points+coalesce(private.eleven_up_row_value(dest),0);
   ELSE
    SELECT (i-1)::integer INTO slot FROM jsonb_array_elements(b->'slots') WITH ORDINALITY s(v,i) WHERE v=to_jsonb(ball);
    IF slot IS NULL OR NOT private.eleven_up_unblocked(b,slot) THEN RAISE EXCEPTION 'eleven_up:covered_or_missing';END IF;
    points:=points+private.eleven_up_row_value(slot);
   END IF;
   total:=total+private.eleven_up_value(ball);
  END LOOP;
  IF total IS DISTINCT FROM 11 THEN RAISE EXCEPTION 'eleven_up:sum';END IF;
 ELSIF action='pass' THEN
  IF NOT private.eleven_up_can_pass(b) THEN RAISE EXCEPTION 'eleven_up:pass_unavailable';END IF;
 ELSIF action<>'take_score' OR phase<>'playing' THEN RAISE EXCEPTION 'eleven_up:invalid_action';END IF;
 IF phase='ready' THEN b:=b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,stageMs}')::bigint);END IF;
 IF action='take_score' THEN RETURN private.eleven_up_board_finish(b,'take_score',at_ms);END IF;
 slots:=b->'slots';cursor_i:=(b->>'cursor')::integer;
 IF action='group' THEN
  SELECT jsonb_agg(CASE WHEN v<>'null'::jsonb AND (v#>>'{}')::integer=ANY(items) THEN 'null'::jsonb ELSE v END ORDER BY i) INTO slots FROM jsonb_array_elements(slots) WITH ORDINALITY s(v,i);
  b:=b||jsonb_build_object('slots',slots,'groups',(b->>'groups')::integer+1,'score',(b->>'score')::bigint+points,'event',jsonb_build_object('label','Eleven!','points',points));
 ELSE
  points:=greatest(0,(b->>'score')::bigint-coalesce(private.eleven_up_row_value(dest),0))-(b->>'score')::bigint;
  -- Full rack: discard this draw and advance without a placement penalty.
  -- An available slot still receives the ball and incurs its row penalty.
  b:=b||jsonb_build_object('slots',CASE WHEN dest IS NULL THEN slots ELSE jsonb_set(slots,ARRAY[dest::text],b->'current') END,'score',(b->>'score')::bigint+points,'event',jsonb_build_object('label','Passed','points',points));
 END IF;
 IF uses_current OR action='pass' THEN b:=b||jsonb_build_object('current',coalesce(b->'deck'->cursor_i,'null'::jsonb),'cursor',least(52,cursor_i+1));END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'slots') v WHERE v<>'null'::jsonb) THEN RETURN private.eleven_up_board_finish(b,'cleared',at_ms);END IF;
 IF NOT private.eleven_up_has_group(b) AND NOT private.eleven_up_can_pass(b) THEN RETURN private.eleven_up_board_finish(b,'blocked',at_ms);END IF;
 RETURN b;
END $$;
CREATE FUNCTION private.eleven_up_visible(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor'])||jsonb_build_object('stockRemaining',52-(s->>'cursor')::integer+CASE WHEN s->'current'<>'null'::jsonb THEN 1 ELSE 0 END,
 'passSlot',private.eleven_up_pass_slot(s),'canPass',private.eleven_up_can_pass(s),'exposed',(SELECT coalesce(jsonb_agg(i ORDER BY i),'[]'::jsonb) FROM generate_series(0,21) i WHERE s->'slots'->i<>'null'::jsonb AND private.eleven_up_unblocked(s,i)),
 'activePlayerId',CASE WHEN s->>'phase'='complete' THEN NULL ELSE s->'players'->(s->>'turnIndex')::integer->>'id' END)
$$;
REVOKE ALL ON FUNCTION private.eleven_up_can_pass(jsonb) FROM PUBLIC,anon,authenticated,service_role;
