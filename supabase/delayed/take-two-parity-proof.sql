CREATE OR REPLACE FUNCTION pg_temp.original_take_two_deal(b jsonb, at_ms bigint, deck jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE layout jsonb;size_i integer;start_i bigint;
BEGIN
 IF private.take_two_rules(b#>>'{rules,version}') IS NULL OR b->'rules' IS DISTINCT FROM private.take_two_rules(b#>>'{rules,version}') THEN RAISE EXCEPTION 'take_two:rules';END IF;
 layout:=private.take_two_layout(coalesce((b->>'stage')::integer,1));size_i:=jsonb_array_length(layout);
 start_i:=at_ms+(b#>>'{rules,introMs}')::integer;
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'layout',layout,
 'slots',(SELECT jsonb_agg(deck->i ORDER BY i) FROM generate_series(0,size_i-1)i),'cursor',size_i+1,'current',deck->size_i,
 'scoreBefore',coalesce(b->'score','0'::jsonb),'score',coalesce(b->'score','0'::jsonb),'samePairs',0,'consecutivePairs',0,
 'meterAt',start_i,'phase','intro','deadline',start_i,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0));
END $function$
;
DO $parity$
DECLARE deck_i jsonb;b jsonb;version_i text;round_i integer;offset_i integer;score_i bigint;count_i integer:=0;
BEGIN
 FOREACH version_i IN ARRAY ARRAY['take-two/1','take-two/2'] LOOP
  FOR round_i IN 1..3 LOOP
   FOR offset_i IN 0..51 LOOP
    SELECT jsonb_agg((i+offset_i)%52 ORDER BY i) INTO deck_i FROM generate_series(0,51)i;
    FOREACH score_i IN ARRAY ARRAY[0,12345]::bigint[] LOOP
     b:=jsonb_build_object('rules',private.take_two_rules(version_i),'stage',round_i,'score',score_i);
     IF private.take_two_board_from_deck(b,1800000000000,deck_i) IS DISTINCT FROM pg_temp.original_take_two_deal(b,1800000000000,deck_i)
     THEN RAISE EXCEPTION 'take_two:legacy_deal_parity';END IF;count_i:=count_i+1;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 IF count_i<>624 THEN RAISE EXCEPTION 'take_two:parity_count';END IF;
END $parity$;
