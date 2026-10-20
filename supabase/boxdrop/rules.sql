-- Frozen boxdrop/1. Every mode calls this reducer; no client scoring authority.
CREATE OR REPLACE FUNCTION private.boxdrop_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"boxdrop/1","stageMs":100000,"introMs":2500,"holdMs":9000,"clockStart":"intro_end","rounds":2,"bonusThreshold":100000,"maxRounds":3,"targets":[32,21],"slots":[6,3],"firstOrder":3200,"closureAwards":[5000,10000,15000,25000],"partialPerPoint":20,"recycleCapacity":6,"recyclePerSlot":1000,"speedStepMs":500,"speedPerStep":100,"bonusRequiresFirstOrder":true,"freshMin":1,"freshMax":11}'::jsonb
$$;
CREATE OR REPLACE FUNCTION private.boxdrop_random(bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE bytes bytea; n bigint;
BEGIN
 IF bound<1 THEN RAISE EXCEPTION 'boxdrop:random_bound';END IF;
 LOOP
  bytes:=extensions.gen_random_bytes(4);
  n:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
  EXIT WHEN n<4294967296-(4294967296%bound);
 END LOOP;
 RETURN (n%bound)::integer;
END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_fresh(b jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE serial integer:=coalesce((b->>'serial')::integer,0)+1;
BEGIN
 RETURN b||jsonb_build_object('serial',serial,'freshDraws',coalesce((b->>'freshDraws')::integer,0)+1,
  'current',jsonb_build_object('id',serial,'value',1+private.boxdrop_random(11),'color',(ARRAY['red','blue','green','yellow'])[1+private.boxdrop_random(4)],'recycled',false));
END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_required_rounds(second_score bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN second_score>=100000 THEN 3 ELSE 2 END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_board_deal(b jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE scales jsonb;
BEGIN
 IF b->'rules' IS DISTINCT FROM private.boxdrop_rules() THEN RAISE EXCEPTION 'boxdrop:rules_version';END IF;
 SELECT jsonb_agg(jsonb_build_object('stage',1,'target',32,'limit',6,'sum',0,'status','active','boxes','[]'::jsonb)) INTO scales FROM generate_series(1,4);
 RETURN private.boxdrop_fresh((b-ARRAY['result','startedAt','botVisited'])||jsonb_build_object(
  'phase','intro','deadline',at_ms+2500,'scoreBefore',coalesce((b->>'score')::bigint,0),'score',coalesce((b->>'score')::bigint,0),
  'scales',scales,'queue','[]'::jsonb,'recycleIndicator',6000,'completedFirstOrders',0,'closures',0,'recycleStreak',0,
  'firstOrderPoints',0,'closurePoints',0,'partialPoints',0,'serial',0,'freshDraws',0,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0)));
END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_board_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE remaining bigint:=greatest(0,least(100000,(b->>'deadline')::bigint-at_ms)); partial_i bigint:=0;
 speed_i bigint:=0; recycling_i bigint:=0; before_i bigint:=(b->>'scoreBefore')::bigint; display_i bigint:=(b->>'score')::bigint; total_i bigint;
BEGIN
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'boxdrop:phase';END IF;
 IF reason NOT IN ('take_score','timeout','full_clear','scales_unavailable') THEN RAISE EXCEPTION 'boxdrop:finish_reason';END IF;
 IF reason<>'timeout' THEN
  SELECT coalesce(sum((s->>'sum')::bigint*20),0) INTO partial_i FROM jsonb_array_elements(b->'scales') s WHERE s->>'status'='active';
  IF (b->>'completedFirstOrders')::integer>0 THEN speed_i:=100*(remaining/500);recycling_i:=(b->>'recycleIndicator')::integer;END IF;
 END IF;
 total_i:=display_i+partial_i+speed_i+recycling_i;
 RETURN b||jsonb_build_object('phase','stage_complete','deadline',at_ms+9000,'score',total_i,
  'result',jsonb_build_object('reason',reason,'scoreBefore',before_i,'displayScore',display_i,'score',total_i,'stageScore',total_i-before_i,
   'firstOrderPoints',b->'firstOrderPoints','closurePoints',b->'closurePoints','partialPoints',(b->>'partialPoints')::bigint+partial_i,
   'speedBonus',speed_i,'recyclingBonus',recycling_i,'bonusEligible',(b->>'completedFirstOrders')::integer>0,
   'completedFirstOrders',b->'completedFirstOrders','remainingMs',CASE WHEN reason='timeout' THEN 0 ELSE remaining END,'completedAt',at_ms),
  'event',jsonb_build_object('label',CASE WHEN reason='full_clear' THEN 'All orders complete!' WHEN reason='timeout' THEN 'Time up' ELSE 'Round complete' END,'points',partial_i+speed_i+recycling_i));
END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE scale_i integer; s jsonb; q jsonb; current_i jsonb; sum_i integer; count_i integer; points_i integer:=0; closures_i integer; label_i text;
BEGIN
 IF b->'rules' IS DISTINCT FROM private.boxdrop_rules() THEN RAISE EXCEPTION 'boxdrop:rules_version';END IF;
 IF b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;END IF;RAISE EXCEPTION 'boxdrop:phase';END IF;
  b:=b||jsonb_build_object('phase','playing','startedAt',b->'deadline','deadline',(b->>'deadline')::bigint+100000,'event',jsonb_build_object('label','Place a box','points',0));
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'boxdrop:phase';END IF;
 -- Timeout has priority over every otherwise legal command.
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.boxdrop_board_finish(b,'timeout',(b->>'deadline')::bigint);END IF;
 IF action='tick' THEN RETURN b;END IF;
 IF action='take_score' THEN RETURN private.boxdrop_board_finish(b,'take_score',at_ms);END IF;
 current_i:=b->'current';
 IF action='recycle' THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS DISTINCT FROM (current_i->>'id')::integer THEN RAISE EXCEPTION 'boxdrop:illegal_move';END IF;
  q:=b->'queue';current_i:=current_i||'{"recycled":true}'::jsonb;
  IF jsonb_array_length(q)<6 THEN b:=private.boxdrop_fresh(b||jsonb_build_object('queue',q||jsonb_build_array(current_i)));
  ELSE b:=b||jsonb_build_object('current',q->0,'queue',(q-0)||jsonb_build_array(current_i));END IF;
  RETURN b||jsonb_build_object('recycleIndicator',1000*(6-jsonb_array_length(b->'queue')),'recycleStreak',(b->>'recycleStreak')::integer+1,'event',jsonb_build_object('label','Recycled','points',0));
 END IF;
 IF action IS DISTINCT FROM 'place' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] NOT BETWEEN 0 AND 3 OR items[1] IS NULL OR items[2] IS DISTINCT FROM (current_i->>'id')::integer THEN RAISE EXCEPTION 'boxdrop:illegal_move';END IF;
 scale_i:=items[1];s:=b->'scales'->scale_i;
 IF s->>'status'<>'active' THEN RAISE EXCEPTION 'boxdrop:illegal_move';END IF;
 s:=s||jsonb_build_object('boxes',(s->'boxes')||jsonb_build_array(current_i),'sum',(s->>'sum')::integer+(current_i->>'value')::integer);
 sum_i:=(s->>'sum')::integer;count_i:=jsonb_array_length(s->'boxes');
 IF sum_i=(s->>'target')::integer THEN
  IF s->>'stage'='1' THEN
   points_i:=3200;label_i:='32 order complete';
   s:=s||'{"stage":2,"target":21,"limit":3,"sum":0,"boxes":[]}'::jsonb;
   b:=b||jsonb_build_object('completedFirstOrders',(b->>'completedFirstOrders')::integer+1,'firstOrderPoints',(b->>'firstOrderPoints')::integer+points_i);
  ELSE
   closures_i:=(b->>'closures')::integer+1;points_i:=(ARRAY[5000,10000,15000,25000])[closures_i];label_i:='Scale closed';
   s:=s||'{"status":"closed"}'::jsonb;
   b:=b||jsonb_build_object('closures',closures_i,'closurePoints',(b->>'closurePoints')::integer+points_i);
  END IF;
 ELSIF sum_i>(s->>'target')::integer THEN s:=s||'{"status":"broken"}'::jsonb;label_i:='Scale overloaded';
 ELSIF count_i=(s->>'limit')::integer THEN
  points_i:=20*sum_i;s:=s||'{"status":"short"}'::jsonb;label_i:='Full scale · partial score';
  b:=b||jsonb_build_object('partialPoints',(b->>'partialPoints')::integer+points_i);
 ELSE label_i:='Box placed';END IF;
 b:=jsonb_set(b,ARRAY['scales',scale_i::text],s)||jsonb_build_object('score',(b->>'score')::bigint+points_i,'recycleStreak',0,
  'event',jsonb_build_object('label',label_i,'points',points_i,'scale',scale_i,'box',current_i));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'scales') x WHERE x->>'status'='active') THEN
  RETURN private.boxdrop_board_finish(b,CASE WHEN (b->>'closures')::integer=4 THEN 'full_clear' ELSE 'scales_unavailable' END,at_ms);
 END IF;
 RETURN private.boxdrop_fresh(b);
END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['serial','freshDraws','botVisited'])||CASE WHEN s ? 'players' THEN jsonb_build_object('activePlayerId',s->'players'->(s->>'turnIndex')::integer->>'id') ELSE '{}'::jsonb END
$$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'boxdrop_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
