-- Approved P-Town Royal Flash v1. One private core for every mode.
CREATE FUNCTION private.royal_flash_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"royal-flash/1","stages":2,"bonusThreshold":200000,"maxBonusStages":1,"stageMs":150000,"readyMs":20000,"introMs":2500,"holdMs":5000,"clearCelebrationMs":0,"timePerSecond":250,"hands":{"royal_flush":50000,"straight_flush":40000,"four_kind":30000,"full_house":20000,"flush":10000,"straight":9000,"three_kind":8000,"two_pair":7000,"pair":5000,"high_card":0}}'::jsonb
$$;

CREATE FUNCTION private.royal_flash_hand(cards jsonb,rules jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE ranks integer[]; counts integer[]; flush_i boolean; straight_i boolean; kind text;
BEGIN
 IF jsonb_array_length(cards)<>5 OR EXISTS(SELECT 1 FROM jsonb_array_elements(cards)c WHERE c='null'::jsonb) THEN RETURN '{"kind":"incomplete","points":0}';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(cards)c WHERE c::integer NOT BETWEEN 0 AND 51) OR (SELECT count(DISTINCT c) FROM jsonb_array_elements_text(cards)c)<>5 THEN RAISE EXCEPTION 'royal_flash:invalid_cards';END IF;
 SELECT array_agg(r ORDER BY r),array_agg(n ORDER BY n DESC) INTO ranks,counts FROM(SELECT c::integer%13+1 r,count(*)::integer n FROM jsonb_array_elements_text(cards)c GROUP BY 1)t;
 SELECT count(DISTINCT c::integer/13)=1 INTO flush_i FROM jsonb_array_elements_text(cards)c;
 straight_i:=cardinality(ranks)=5 AND (ranks[5]-ranks[1]=4 OR ranks=ARRAY[1,10,11,12,13]);
 kind:=CASE WHEN flush_i AND ranks=ARRAY[1,10,11,12,13] THEN 'royal_flush' WHEN flush_i AND straight_i THEN 'straight_flush'
  WHEN counts[1]=4 THEN 'four_kind' WHEN counts[1]=3 AND counts[2]=2 THEN 'full_house' WHEN flush_i THEN 'flush'
  WHEN straight_i THEN 'straight' WHEN counts[1]=3 THEN 'three_kind' WHEN counts[1]=2 AND counts[2]=2 THEN 'two_pair' WHEN counts[1]=2 THEN 'pair' ELSE 'high_card' END;
 RETURN jsonb_build_object('kind',kind,'points',(rules->'hands'->>kind)::integer);
END $$;

CREATE FUNCTION private.royal_flash_lines(slots jsonb,rules jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_agg(private.royal_flash_hand((SELECT jsonb_agg(slots->(CASE WHEN line<5 THEN line*5+i ELSE i*5+line-5 END) ORDER BY i) FROM generate_series(0,4)i),rules) ORDER BY line) FROM generate_series(0,9)line
$$;

CREATE FUNCTION private.royal_flash_shuffle() RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=ARRAY(SELECT generate_series(0,51));i integer;j integer;sample bigint;bytes bytea;temp integer;limit_i bigint;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  limit_i:=4294967296-(4294967296%i);
  LOOP bytes:=extensions.gen_random_bytes(4);sample:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);EXIT WHEN sample<limit_i;END LOOP;
  j:=sample%i+1;temp:=cards[i];cards[i]:=cards[j];cards[j]:=temp;
 END LOOP;RETURN to_jsonb(cards);
END $$;

CREATE FUNCTION private.royal_flash_bonus_qualified(score bigint,rules jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT score>=(rules->>'bonusThreshold')::bigint $$;

CREATE FUNCTION private.royal_flash_board_deal(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.royal_flash_shuffle();slots jsonb:=(SELECT jsonb_agg(NULL::integer) FROM generate_series(1,25));
BEGIN
 IF b->'rules' IS DISTINCT FROM private.royal_flash_rules() THEN RAISE EXCEPTION 'royal_flash:ruleset_conflict';END IF;
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'slots',slots,'cursor',1,'current',deck->0,'placements',0,'handPoints',0,'lines',private.royal_flash_lines(slots,b->'rules'),
 'scoreBefore',coalesce((b->>'score')::bigint,0),'phase','intro','deadline',at_ms+(b#>>'{rules,introMs}')::bigint,'event',jsonb_build_object('label','Royal Flash','points',0));
END $$;

CREATE FUNCTION private.royal_flash_board_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bonus bigint:=0;total bigint;result jsonb;full_i boolean;
BEGIN
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'slots')x WHERE x='null'::jsonb) INTO full_i;
 IF full_i AND reason IN('take_score','exhausted') THEN bonus:=greatest(0,(b->>'deadline')::bigint-at_ms)/1000*(b#>>'{rules,timePerSecond}')::bigint;END IF;
 total:=(b->>'scoreBefore')::bigint+(b->>'handPoints')::bigint+bonus;
 result:=jsonb_build_object('scoreBefore',(b->>'scoreBefore')::bigint,'score',total,'displayScore',total,'stageScore',total-(b->>'scoreBefore')::bigint,'handPoints',(b->>'handPoints')::bigint,'timeBonus',bonus,'reason',reason,'completedAt',at_ms,'presentationMs',15000,'lines',b->'lines','slots',b->'slots');
 RETURN b||jsonb_build_object('score',total,'result',result,'phase','stage_complete','deadline',at_ms+greatest(15000,(b#>>'{rules,holdMs}')::bigint),
 'event',jsonb_build_object('label',CASE reason WHEN 'timeout' THEN 'Time expired' WHEN 'ready_timeout' THEN 'Round not started' WHEN 'exhausted' THEN 'Deck complete' ELSE 'Score taken' END,'points',bonus));
END $$;

CREATE FUNCTION private.royal_flash_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text:=b->>'phase';slot integer;cursor_i integer;lines jsonb;points bigint;
BEGIN
 IF phase='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;ELSE RAISE EXCEPTION 'royal_flash:intro';END IF;END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint);phase:='ready';
 END IF;
 IF phase NOT IN('ready','playing') THEN RAISE EXCEPTION 'royal_flash:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.royal_flash_board_finish(b,CASE WHEN phase='ready' THEN 'ready_timeout' ELSE 'timeout' END,(b->>'deadline')::bigint);END IF;
 IF action='tick' THEN RETURN b;END IF;
 IF action='place' THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 24 OR b->'current'='null'::jsonb THEN RAISE EXCEPTION 'royal_flash:invalid_placement';END IF;
 ELSIF action<>'take_score' OR phase<>'playing' OR items IS NOT NULL THEN RAISE EXCEPTION 'royal_flash:invalid_action';END IF;
 IF phase='ready' THEN b:=b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,stageMs}')::bigint);END IF;
 IF action='take_score' THEN RETURN private.royal_flash_board_finish(b,'take_score',at_ms);END IF;
 slot:=items[1];cursor_i:=(b->>'cursor')::integer;
 b:=jsonb_set(b,ARRAY['slots',slot::text],b->'current');lines:=private.royal_flash_lines(b->'slots',b->'rules');
 SELECT sum((x->>'points')::bigint) INTO points FROM jsonb_array_elements(lines)x;
 b:=b||jsonb_build_object('lines',lines,'handPoints',points,'score',(b->>'scoreBefore')::bigint+points,'placements',(b->>'placements')::integer+1,
  'current',CASE WHEN cursor_i<52 THEN b->'deck'->cursor_i ELSE 'null'::jsonb END,'cursor',least(52,cursor_i+1),'event',jsonb_build_object('label','Card placed','points',points-(b->>'handPoints')::bigint,'slot',slot));
 IF cursor_i=52 THEN RETURN private.royal_flash_board_finish(b,'exhausted',at_ms);END IF;
 RETURN b;
END $$;

CREATE FUNCTION private.royal_flash_visible(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor'])||jsonb_build_object('stockRemaining',52-(s->>'placements')::integer,'activePlayerId',CASE WHEN s->>'phase'='complete' THEN NULL ELSE s->'players'->(s->>'turnIndex')::integer->>'id' END)
$$;
