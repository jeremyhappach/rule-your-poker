-- Approved Ptown adaptation; not a claim of historical Merit rule parity.
-- Card identity: suit * 13 + rank - 2, suits clubs/diamonds/hearts/spades.
CREATE OR REPLACE FUNCTION private.race_poker_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"race-poker/1","handMs":30000,"holdMs":2000,"target":48000,"roundCap":16,"deckSize":52,"choices":3,"handSize":5,"equalFinalHands":true,"fifthReplacement":false,"timeoutPoints":0,"awards":[4500,6700,9000,12000,15000,18700,22500,28500,37500]}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.race_poker_random(bound_i integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE bytes bytea; value_i bigint; limit_i bigint;
BEGIN
 IF bound_i IS NULL OR bound_i<1 THEN RAISE EXCEPTION 'race_poker:random_bound';END IF;
 limit_i:=4294967296-(4294967296%bound_i);
 LOOP
  bytes:=extensions.gen_random_bytes(4);
  value_i:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)*65536+get_byte(bytes,2)*256+get_byte(bytes,3);
  EXIT WHEN value_i<limit_i;
 END LOOP;
 RETURN (value_i%bound_i)::integer;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_shuffle() RETURNS integer[]
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=ARRAY(SELECT generate_series(0,51));i integer;j integer;swap integer;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  j:=private.race_poker_random(i)+1;swap:=cards[i];cards[i]:=cards[j];cards[j]:=swap;
 END LOOP;
 RETURN cards;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_score(cards integer[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE ranks integer[];groups integer[];flush_i boolean;straight_i boolean;points integer;label text;
BEGIN
 IF cardinality(cards) IS DISTINCT FROM 5 OR
  EXISTS(SELECT 1 FROM unnest(cards)c WHERE c IS NULL OR c<0 OR c>51) OR
  (SELECT count(DISTINCT c) FROM unnest(cards)c)<>5 THEN RAISE EXCEPTION 'race_poker:invalid_cards';END IF;
 SELECT array_agg(r ORDER BY r) INTO ranks FROM (SELECT DISTINCT c%13+2 r FROM unnest(cards)c) q;
 SELECT array_agg(n ORDER BY n DESC) INTO groups FROM (SELECT count(*)::integer n FROM unnest(cards)c GROUP BY c%13) q;
 SELECT count(DISTINCT c/13)=1 INTO flush_i FROM unnest(cards)c;
 straight_i:=cardinality(ranks)=5 AND (ranks[5]-ranks[1]=4 OR ranks=ARRAY[2,3,4,5,14]);
 IF flush_i AND straight_i AND ranks=ARRAY[10,11,12,13,14] THEN points:=37500;label:='Royal flush';
 ELSIF flush_i AND straight_i THEN points:=28500;label:='Straight flush';
 ELSIF groups=ARRAY[4,1] THEN points:=22500;label:='Four of a kind';
 ELSIF groups=ARRAY[3,2] THEN points:=18700;label:='Full house';
 ELSIF flush_i THEN points:=15000;label:='Flush';
 ELSIF straight_i THEN points:=12000;label:='Straight';
 ELSIF groups=ARRAY[3,1,1] THEN points:=9000;label:='Three of a kind';
 ELSIF groups=ARRAY[2,2,1] THEN points:=6700;label:='Two pair';
 ELSIF groups=ARRAY[2,1,1,1] THEN points:=4500;label:='Pair';
 ELSE points:=ranks[cardinality(ranks)]*100;label:='High card';END IF;
 RETURN jsonb_build_object('label',label,'points',points);
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor'])||jsonb_build_object('activePlayerId',s->'players'->(s->>'turnIndex')::integer->>'id')
$$;

CREATE OR REPLACE FUNCTION private.race_poker_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=private.race_poker_shuffle();starter integer;totals jsonb;
BEGIN
 IF s->'rules' IS DISTINCT FROM private.race_poker_rules() OR jsonb_array_length(s->'players')<>2 THEN RAISE EXCEPTION 'race_poker:configuration';END IF;
 IF NOT s ? 'starter' THEN
  starter:=private.race_poker_random(2);
  SELECT jsonb_object_agg(p->>'id',0) INTO totals FROM jsonb_array_elements(s->'players')p;
  s:=s||jsonb_build_object('starter',starter,'turnIndex',starter,'handInRound',0,'stage',1,'scores',totals,'stages','[]'::jsonb,'botPolicy','race-poker-bot/1');
 END IF;
 RETURN s||jsonb_build_object('deck',to_jsonb(cards),'cursor',3,'choices',to_jsonb(cards[1:3]),'hand','[]'::jsonb,
  'phase','playing','startedAt',at_ms,'deadline',at_ms+30000,'result',NULL,
  'event',jsonb_build_object('label',CASE WHEN coalesce((s->>'finalHand')::boolean,false) THEN 'Final hand' ELSE 'Choose a card' END,'points',0));
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE player text:=s->'players'->(s->>'turnIndex')::integer->>'id';hand_i jsonb:=s->'hand';
 result_i jsonb;points integer:=0;before_i integer:=(s->'scores'->>player)::integer;slot integer;cursor_i integer;
 round_i integer:=(s->>'stage')::integer;starter_i integer:=(s->>'starter')::integer;deadline_i bigint:=(s->>'deadline')::bigint;
BEGIN
 IF s->'rules' IS DISTINCT FROM private.race_poker_rules() THEN RAISE EXCEPTION 'race_poker:configuration';END IF;
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'race_poker:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action<>'tick' THEN RAISE EXCEPTION 'race_poker:phase';END IF;
  IF at_ms<deadline_i THEN RETURN s;END IF;
  IF (s->>'handInRound')::integer=1 THEN
   IF round_i=16 OR EXISTS(SELECT 1 FROM jsonb_each_text(s->'scores')v WHERE v.value::integer>=48000) THEN
    RETURN s||jsonb_build_object('phase','complete','deadline',0,'choices','[]'::jsonb,'hand','[]'::jsonb);
   END IF;
   starter_i:=1-starter_i;
   s:=s||jsonb_build_object('stage',round_i+1,'starter',starter_i,'turnIndex',starter_i,'handInRound',0,'finalHand',false);
  ELSE
   s:=s||jsonb_build_object('turnIndex',1-starter_i,'handInRound',1,'finalHand',
    EXISTS(SELECT 1 FROM jsonb_each_text(s->'scores')v WHERE v.value::integer>=48000));
  END IF;
  RETURN private.race_poker_deal(s,deadline_i);
 END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'race_poker:phase';END IF;
 IF action='tick' THEN
  IF at_ms<deadline_i THEN RETURN s;END IF;
  result_i:=jsonb_build_object('label','Time expired — 0 points','points',0,'reason','timeout');
  hand_i:='[]'::jsonb;at_ms:=deadline_i;
 ELSIF action='choose' THEN
  IF at_ms>=deadline_i THEN RAISE EXCEPTION 'race_poker:deadline';END IF;
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
  slot:=items[1];
  hand_i:=hand_i||jsonb_build_array(s->'choices'->slot);
  IF jsonb_array_length(hand_i)<5 THEN
   cursor_i:=(s->>'cursor')::integer;
   RETURN jsonb_set(s,ARRAY['choices',slot::text],s->'deck'->cursor_i)||
    jsonb_build_object('hand',hand_i,'cursor',cursor_i+1,'event',jsonb_build_object('label','Card selected','points',0,'slot',slot));
  END IF;
  -- Fifth pick: score and commit, never read or reveal the next hidden card.
  result_i:=private.race_poker_score(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(hand_i)))||'{"reason":"hand"}'::jsonb;
  points:=(result_i->>'points')::integer;
 ELSE RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 result_i:=result_i||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',round_i,player),
  'playerId',player,'stage',round_i,'hand',hand_i,'scoreBefore',before_i,'score',before_i+points,'stageScore',points,'completedAt',at_ms);
 s:=jsonb_set(s,ARRAY['scores',player],to_jsonb(before_i+points));
 RETURN (s-ARRAY['deck','cursor'])||jsonb_build_object('hand',hand_i,'choices','[]'::jsonb,'phase','stage_complete','deadline',at_ms+2000,
  'result',result_i,'stages',s->'stages'||jsonb_build_array(result_i),'event',result_i);
END $$;

-- Separately versioned policy. The function accepts only an explicit public
-- hand and choices, never a match, deck, cursor, or shuffle seed.
-- Deterministic hypothetical samples allow exact hidden-order independence tests.
CREATE OR REPLACE FUNCTION private.race_poker_bot_choice(hand_i integer[],choices_i integer[]) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE candidate integer;trial integer;draw_i integer;sample_i integer[];unseen integer[];pool integer[];j integer;
 total_i bigint;best bigint:=-1;best_i integer:=0;key_i bigint;chosen integer;other integer;value_i integer;best_value integer;count_i integer;
BEGIN
 IF cardinality(choices_i)<>3 OR cardinality(hand_i)>4 THEN RAISE EXCEPTION 'race_poker:bot_input';END IF;
 SELECT array_agg(c) INTO unseen FROM generate_series(0,51)c WHERE NOT c=ANY(hand_i||choices_i);
 FOR candidate IN 0..2 LOOP
  total_i:=0;
  FOR trial IN 1..48 LOOP
   sample_i:=hand_i||choices_i[candidate+1];
   pool:=unseen;
   -- Hypothetical continuation can retain the two visible unchosen cards.
   FOR draw_i IN cardinality(sample_i)+1..5 LOOP
    key_i:=(hashtextextended(concat_ws(':','race-poker-bot/1',hand_i::text,choices_i::text,trial,draw_i),0) & 9223372036854775807);
    j:=1+(key_i%cardinality(pool))::integer;chosen:=pool[j];best_value:=-1;
    FOR other IN 1..3 LOOP
     IF other=candidate+1 OR choices_i[other]=ANY(sample_i) THEN CONTINUE;END IF;
     SELECT count(*) INTO count_i FROM unnest(sample_i)c WHERE c%13=choices_i[other]%13;
     value_i:=count_i*100+choices_i[other]%13;
     IF value_i>best_value THEN best_value:=value_i;chosen:=choices_i[other];END IF;
    END LOOP;
    SELECT count(*) INTO count_i FROM unnest(sample_i)c WHERE c%13=pool[j]%13;
    IF count_i*100+pool[j]%13>best_value THEN chosen:=pool[j];END IF;
    sample_i:=sample_i||chosen;pool:=array_remove(pool,chosen);
   END LOOP;
   total_i:=total_i+(private.race_poker_score(sample_i)->>'points')::integer;
  END LOOP;
  IF total_i>best THEN best:=total_i;best_i:=candidate;END IF;
 END LOOP;
 RETURN best_i;
END $$;

DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'race_poker_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
