-- Bounded visible-only one-draw expectation. No RNG state or future draws enter.
CREATE OR REPLACE FUNCTION private.boxdrop_bot_value(s jsonb,value_i integer,closures_i integer) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE remaining integer:=(s->>'target')::integer-(s->>'sum')::integer-value_i;
 slots integer:=(s->>'limit')::integer-jsonb_array_length(s->'boxes')-1; award integer; expectation numeric:=0; next_i integer;
BEGIN
 IF s->>'status'<>'active' THEN RETURN -100000;END IF;
 award:=CASE WHEN s->>'stage'='1' THEN 3200 ELSE (ARRAY[5000,10000,15000,25000])[closures_i+1] END;
 IF remaining=0 THEN RETURN award+CASE WHEN s->>'stage'='1' THEN 3500 ELSE 0 END;END IF;
 IF remaining<0 THEN RETURN -2500;END IF;
 IF slots=0 THEN RETURN ((s->>'sum')::integer+value_i)*20-900;END IF;
 -- Uniform next draw, with an option to place elsewhere or recycle.
 FOR next_i IN 1..11 LOOP
  expectation:=expectation+CASE WHEN next_i=remaining THEN award WHEN next_i<remaining AND slots>1 THEN 200 ELSE -50 END;
 END LOOP;
 RETURN expectation/11+CASE WHEN remaining<=slots*11 AND remaining>=slots THEN 300 ELSE -500 END
  -abs(remaining::numeric/slots-6)*10;
END $$;
CREATE OR REPLACE FUNCTION private.boxdrop_bot_choice(visible jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE best numeric:=-100000; utility numeric; scale_i integer; best_scale integer:=0; next_i integer;
 recycle_value numeric:=0; next_best numeric; s jsonb; value_i integer:=(visible#>>'{current,value}')::integer;
BEGIN
 FOR scale_i IN 0..3 LOOP
  utility:=private.boxdrop_bot_value(visible->'scales'->scale_i,value_i,(visible->>'closures')::integer);
  IF utility>best THEN best:=utility;best_scale:=scale_i;END IF;
 END LOOP;
 IF (visible->>'deadline')::bigint-at_ms<1500 AND (visible->>'completedFirstOrders')::integer>0 THEN RETURN '{"action":"take_score"}';END IF;
 IF (visible->>'recycleStreak')::integer<7 THEN
  FOR next_i IN 1..CASE WHEN jsonb_array_length(visible->'queue')=6 THEN 1 ELSE 11 END LOOP
   next_best:=-100000;
   FOR scale_i IN 0..3 LOOP
    utility:=private.boxdrop_bot_value(visible->'scales'->scale_i,CASE WHEN jsonb_array_length(visible->'queue')=6 THEN (visible#>>'{queue,0,value}')::integer ELSE next_i END,(visible->>'closures')::integer);
    next_best:=greatest(next_best,utility);
   END LOOP;
   recycle_value:=recycle_value+next_best;
  END LOOP;
  recycle_value:=recycle_value/CASE WHEN jsonb_array_length(visible->'queue')=6 THEN 1 ELSE 11 END-350;
  IF recycle_value>best THEN RETURN jsonb_build_object('action','recycle','items',jsonb_build_array(visible#>'{current,id}'));END IF;
 END IF;
 IF best<0 AND (visible->>'completedFirstOrders')::integer>0 THEN RETURN '{"action":"take_score"}';END IF;
 RETURN jsonb_build_object('action','place','items',jsonb_build_array(best_scale,visible#>'{current,id}'));
END $$;
REVOKE ALL ON FUNCTION private.boxdrop_bot_value(jsonb,integer,integer),private.boxdrop_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
