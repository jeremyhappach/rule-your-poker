-- trip-flip/1: the sole gameplay rule base for both lifecycle adapters.
CREATE OR REPLACE FUNCTION private.trip_flip_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"trip-flip/1","stageMs":180000,"introMs":2500,"holdMs":6000,"clockStart":"intro_end","rounds":2,"dots":30,"dotMs":6000,"timePerDot":125,"tripPoints":3000,"runPoints":600,"suitedBonus":5000,"specialBonus":10000,"aceLowOnly":true}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_random(bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE bytes bytea;n bigint;
BEGIN
 IF bound<1 THEN RAISE EXCEPTION 'trip_flip:random_bound';END IF;
 LOOP
  bytes:=extensions.gen_random_bytes(4);
  n:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
  EXIT WHEN n<4294967296-(4294967296%bound);
 END LOOP;
 RETURN (n%bound)::integer;
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_shuffle() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE a integer[]:=ARRAY(SELECT generate_series(0,53));i integer;j integer;t integer;
BEGIN
 FOR i IN REVERSE 54..2 LOOP j:=private.trip_flip_random(i)+1;t:=a[i];a[i]:=a[j];a[j]:=t;END LOOP;
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_combination(cards jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE natural_i integer[];r integer;start_i integer;direction integer;candidate integer[];valid boolean;i integer;c integer;
BEGIN
 IF jsonb_typeof(cards) IS DISTINCT FROM 'array' OR jsonb_array_length(cards)<>3 THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(cards)x WHERE jsonb_typeof(x)<>'number' OR x::integer NOT BETWEEN 0 AND 53)
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(cards)x)<>3 THEN RETURN NULL;END IF;
 SELECT array_agg(x::integer%13+1) INTO natural_i FROM jsonb_array_elements(cards)x WHERE x::integer<52;
 IF cardinality(natural_i)>0 AND (SELECT count(DISTINCT x) FROM unnest(natural_i)x)=1 THEN
  RETURN jsonb_build_object('kind','trip','ranks',jsonb_build_array(natural_i[1],natural_i[1],natural_i[1]),'natural',cardinality(natural_i)=3,'suited',false);
 END IF;
 FOR start_i IN 1..13 LOOP
  FOREACH direction IN ARRAY ARRAY[1,-1] LOOP
   IF start_i+2*direction NOT BETWEEN 1 AND 13 THEN CONTINUE;END IF;
   candidate:=ARRAY[start_i,start_i+direction,start_i+2*direction];valid:=true;
   FOR i IN 0..2 LOOP c:=(cards->>i)::integer;IF c<52 AND c%13+1<>candidate[i+1] THEN valid:=false;EXIT;END IF;END LOOP;
   IF valid THEN RETURN jsonb_build_object('kind','run','ranks',to_jsonb(candidate),'natural',cardinality(natural_i)=3,
    'suited',cardinality(natural_i)=3 AND (SELECT count(DISTINCT x::integer/13) FROM jsonb_array_elements(cards)x)=1);END IF;
  END LOOP;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_special() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE first_i integer:=private.trip_flip_random(11);direction integer:=CASE WHEN private.trip_flip_random(2)=0 THEN 1 ELSE -1 END;
BEGIN
 IF direction=-1 THEN first_i:=first_i+2;END IF;
 RETURN jsonb_build_array(first_i+13*private.trip_flip_random(4),first_i+direction+13*private.trip_flip_random(4),first_i+2*direction+13*private.trip_flip_random(4));
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_card(b jsonb,location integer) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN location BETWEEN 0 AND 3 THEN (b->'columns'->location->>-1)::integer
 WHEN location BETWEEN 4 AND 6 THEN (b->'cells'->>(location-4))::integer
 WHEN location=7 THEN (b->'fan'->>0)::integer END
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_moves(b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(src,dst,private.trip_flip_card(b,src)) ORDER BY src,dst),'[]'::jsonb)
 FROM generate_series(0,7)src CROSS JOIN generate_series(0,6)dst
 WHERE src<>dst AND private.trip_flip_card(b,src) IS NOT NULL AND
 CASE WHEN dst<4 THEN jsonb_array_length(b->'columns'->dst)<3 ELSE b->'cells'->(dst-4)='null'::jsonb END
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_dots(b jsonb,at_ms bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT least((b#>>'{rules,dots}')::integer,ceil(greatest(0,(b->>'deadline')::bigint-at_ms)::numeric/(b#>>'{rules,dotMs}')::integer)::integer)
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_board_deal(b jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE deck jsonb:=private.trip_flip_shuffle();start_i bigint;
BEGIN
 IF b->'rules' IS DISTINCT FROM private.trip_flip_rules() THEN RAISE EXCEPTION 'trip_flip:rules';END IF;
 start_i:=at_ms+(b#>>'{rules,introMs}')::integer;
 RETURN (b-ARRAY['result','startedAt','botVisited'])||jsonb_build_object('deck',deck,'columns','[[],[],[],[]]'::jsonb,'cells','[null,null,null]'::jsonb,
 'fan',jsonb_build_array(deck->0,deck->1,deck->2),'cursor',3,'special',private.trip_flip_special(),'specialClaimed',false,
 'scoreBefore',coalesce(b->'score','0'::jsonb),'score',coalesce(b->'score','0'::jsonb),'trips',0,'runs',0,'suitedTotal',0,'specialTotal',0,
 'recentPositions','[]'::jsonb,'phase','intro','deadline',start_i,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0));
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_board_finish(b jsonb,at_ms bigint,reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dots_i integer:=private.trip_flip_dots(b,at_ms);time_i integer;total bigint;result_i jsonb;
BEGIN
 time_i:=dots_i*(b#>>'{rules,timePerDot}')::integer;total:=(b->>'score')::bigint+time_i;
 result_i:=jsonb_build_object('reason',reason,'scoreBefore',b->'scoreBefore','displayScore',b->'score','score',total,'stageScore',total-(b->>'scoreBefore')::bigint,
 'tripPoints',(b->>'trips')::integer*(b#>>'{rules,tripPoints}')::integer,'runPoints',(b->>'runs')::integer*(b#>>'{rules,runPoints}')::integer,
 'suitedBonus',b->'suitedTotal','specialBonus',b->'specialTotal','timeDots',dots_i,'timeBonus',time_i,'completedAt',at_ms);
 RETURN b||jsonb_build_object('score',total,'result',result_i,'phase','stage_complete','deadline',at_ms+(b#>>'{rules,holdMs}')::integer,
 'event',jsonb_build_object('label',CASE reason WHEN 'full_clear' THEN 'Playfield cleared!' WHEN 'timeout' THEN 'Time up' ELSE 'Score banked' END,'points',time_i));
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE src integer;dst integer;card integer;cursor_i integer;cards jsonb;combo jsonb;points_i integer:=0;suited_i integer:=0;special_i integer:=0;kind text;label_i text:='Card moved';
BEGIN
 IF b->'rules' IS DISTINCT FROM private.trip_flip_rules() THEN RAISE EXCEPTION 'trip_flip:rules';END IF;
 IF b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;END IF;RAISE EXCEPTION 'trip_flip:intro';END IF;
  b:=b||jsonb_build_object('phase','playing','startedAt',b->'deadline','deadline',(b->>'deadline')::bigint+(b#>>'{rules,stageMs}')::integer);
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'trip_flip:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.trip_flip_board_finish(b,(b->>'deadline')::bigint,'timeout');END IF;
 IF action='tick' THEN RETURN b;END IF;
 IF action='take_score' THEN RETURN private.trip_flip_board_finish(b,at_ms,'take_score');END IF;
 IF action<>'move' OR cardinality(items) IS DISTINCT FROM 3 OR array_position(items,NULL) IS NOT NULL THEN RAISE EXCEPTION 'trip_flip:invalid_command';END IF;
 src:=items[1];dst:=items[2];card:=items[3];
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.trip_flip_moves(b))m WHERE m=to_jsonb(items)) THEN RAISE EXCEPTION 'trip_flip:illegal_move';END IF;
 -- Positions contain only visible columns/cells. A fan play makes permanent
 -- progress and resets this bounded bot loop history for the next stock card.
 b:=jsonb_set(b,'{recentPositions}',CASE WHEN src=7 THEN '[]'::jsonb ELSE coalesce(b->'recentPositions','[]'::jsonb)||jsonb_build_array(md5(jsonb_build_array(b->'columns',b->'cells')::text)) END);
 IF jsonb_array_length(b->'recentPositions')>128 THEN b:=jsonb_set(b,'{recentPositions}',(b->'recentPositions')-0);END IF;
 IF src<4 THEN b:=jsonb_set(b,ARRAY['columns',src::text],(b->'columns'->src)-(-1));
 ELSIF src<7 THEN b:=jsonb_set(b,ARRAY['cells',(src-4)::text],'null');
 ELSE
  cursor_i:=(b->>'cursor')::integer;cards:=(b->'fan')-0;
  IF cursor_i<54 THEN cards:=cards||jsonb_build_array(b->'deck'->cursor_i);cursor_i:=cursor_i+1;END IF;
  b:=b||jsonb_build_object('fan',cards,'cursor',cursor_i);
 END IF;
 IF dst>=4 THEN b:=jsonb_set(b,ARRAY['cells',(dst-4)::text],to_jsonb(card));
 ELSE
  cards:=(b->'columns'->dst)||jsonb_build_array(card);combo:=private.trip_flip_combination(cards);
  IF combo IS NOT NULL THEN
   kind:=combo->>'kind';points_i:=(b#>>ARRAY['rules',kind||'Points'])::integer;
   IF (combo->>'suited')::boolean THEN suited_i:=(b#>>'{rules,suitedBonus}')::integer;END IF;
   IF kind='run' AND (combo->>'natural')::boolean AND NOT (b->>'specialClaimed')::boolean AND cards=b->'special' THEN special_i:=(b#>>'{rules,specialBonus}')::integer;END IF;
   label_i:=CASE WHEN special_i>0 THEN 'Special Run!' WHEN suited_i>0 THEN 'Suited Run!' WHEN kind='trip' THEN 'Trip!' ELSE 'Run!' END;
   b:=b||jsonb_build_object(kind||'s',(b->>(kind||'s'))::integer+1,'suitedTotal',(b->>'suitedTotal')::integer+suited_i,
    'specialTotal',(b->>'specialTotal')::integer+special_i,'specialClaimed',(b->>'specialClaimed')::boolean OR special_i>0);
   cards:='[]';
  END IF;
  b:=jsonb_set(b,ARRAY['columns',dst::text],cards);
 END IF;
 points_i:=points_i+suited_i+special_i;
 b:=b||jsonb_build_object('score',(b->>'score')::bigint+points_i,'event',jsonb_build_object('label',label_i,'points',points_i,'source',src,'destination',dst,'card',card,'combination',combo,'special',special_i>0));
 IF (b->>'cursor')::integer=54 AND b->'fan'='[]'::jsonb AND b->'columns'='[[],[],[],[]]'::jsonb AND b->'cells'='[null,null,null]'::jsonb THEN RETURN private.trip_flip_board_finish(b,at_ms,'full_clear');END IF;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor','botVisited'])||jsonb_build_object('stockRemaining',54-(s->>'cursor')::integer,'legalMoves',private.trip_flip_moves(s),
 'activePlayerId',s->'players'->(s->>'turnIndex')::integer->>'id')
$$;
