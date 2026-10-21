CREATE OR REPLACE FUNCTION pg_temp.race_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Race Poker proof: %',label;END IF;END $$;
DO $$
DECLARE fixture record;s jsonb;v jsonb;old_s jsonb;i integer;j integer;starter integer;first_id uuid:=gen_random_uuid();second_id uuid:=gen_random_uuid();deck integer[];bot integer;
BEGIN
 FOR fixture IN SELECT * FROM (VALUES
  (ARRAY[12,20,30,42,5],1400,'High card'),
  (ARRAY[0,13,4,20,34],4500,'Pair'),
  (ARRAY[0,13,1,14,33],6700,'Two pair'),
  (ARRAY[0,13,26,4,20],9000,'Three of a kind'),
  (ARRAY[0,14,28,42,4],12000,'Straight'),
  (ARRAY[0,2,5,8,11],15000,'Flush'),
  (ARRAY[0,13,26,1,14],18700,'Full house'),
  (ARRAY[0,13,26,39,5],22500,'Four of a kind'),
  (ARRAY[0,1,2,3,4],28500,'Straight flush'),
  (ARRAY[8,9,10,11,12],37500,'Royal flush'),
  (ARRAY[12,13,27,41,3],12000,'Wheel'),
  (ARRAY[12,0,1,2,3],28500,'Suited wheel'),
  (ARRAY[8,22,36,50,12],12000,'Broadway'),
  (ARRAY[10,24,38,39,1],1400,'No wrap')
 )f(cards,points,label) LOOP
  PERFORM pg_temp.race_assert((private.race_poker_score(fixture.cards)->>'points')::integer=fixture.points,fixture.label);
 END LOOP;
 FOR i IN 7..14 LOOP
  PERFORM pg_temp.race_assert((private.race_poker_score(ARRAY[0,14,28,43,i-2])->>'points')::int=i*100,'complete high-card rank formula');
 END LOOP;
 BEGIN PERFORM private.race_poker_score(ARRAY[0,0,1,2,3]);RAISE EXCEPTION 'missed duplicate';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:invalid_cards' THEN RAISE;END IF;END;
 s:=private.race_poker_deal(jsonb_build_object('rules',private.race_poker_rules(),'players',jsonb_build_array(jsonb_build_object('id',first_id),jsonb_build_object('id',second_id)),
  'identity',jsonb_build_object('dealerGameId',first_id,'roundId',second_id)),1000);
 PERFORM pg_temp.race_assert(jsonb_array_length(s->'deck')=52 AND (SELECT count(DISTINCT value)=52 FROM jsonb_array_elements(s->'deck')),'52 unique cards');
 starter:=(s->>'starter')::integer;
 old_s:=s;v:=private.race_poker_reduce(s,'choose',ARRAY[1],30999);
 PERFORM pg_temp.race_assert(v->'hand'->0=s->'choices'->1 AND v->'choices'->0=s->'choices'->0 AND v->'choices'->2=s->'choices'->2 AND v->>'deadline'=s->>'deadline','selection / persistence / fixed clock');
 BEGIN PERFORM private.race_poker_reduce(s,'choose',ARRAY[0],31000);RAISE EXCEPTION 'missed deadline';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:deadline' THEN RAISE;END IF;END;
 v:=private.race_poker_reduce(v,'tick',NULL,31000);
 PERFORM pg_temp.race_assert(v#>>'{result,points}'='0' AND v->'hand'='[]'::jsonb AND v->>'deadline'='33000','partial timeout discards / zero / hold');
 v:=private.race_poker_reduce(v,'tick',NULL,33000);
 PERFORM pg_temp.race_assert((v->>'turnIndex')::int=1-starter AND v->>'stage'='1','second actor same paired round');
 v:=private.race_poker_reduce(v,'tick',NULL,63000);v:=private.race_poker_reduce(v,'tick',NULL,65000);
 PERFORM pg_temp.race_assert((v->>'starter')::int=1-starter AND (v->>'turnIndex')::int=1-starter AND v->>'stage'='2','alternate starter');
 s:=old_s;
 FOR i IN 1..4 LOOP s:=private.race_poker_reduce(s,'choose',ARRAY[0],1000+i);END LOOP;
 old_s:=s;
 s:=private.race_poker_reduce(s,'choose',ARRAY[0],1005);
 PERFORM pg_temp.race_assert(s->>'phase'='stage_complete' AND jsonb_array_length(s->'hand')=5 AND s->'choices'='[]'::jsonb AND NOT s?'deck' AND NOT s?'cursor','fifth atomic / no replacement / hidden deck discarded');
 PERFORM pg_temp.race_assert((old_s->>'cursor')::int=7,'only seven cards exposed before fifth selection');
 -- Exact fifth outcome is independent of every hidden future card.
 v:=jsonb_set(old_s,'{deck}',(old_s->'deck')||'[999]'::jsonb);
 PERFORM pg_temp.race_assert(private.race_poker_reduce(v,'choose',ARRAY[0],1005)=s,'fifth never reads hidden replacement');
 -- Threshold first and second actor, overshoot, and equal final hands.
 s:=jsonb_set(s,ARRAY['scores',s->'players'->starter->>'id'],'49000');
 s:=private.race_poker_reduce(s,'tick',NULL,3005);
 PERFORM pg_temp.race_assert(s->>'phase'='playing' AND s->>'finalHand'='true' AND s->>'handInRound'='1','final hand, not premature winner');
 s:=private.race_poker_reduce(s,'tick',NULL,33005);s:=private.race_poker_reduce(s,'tick',NULL,35005);
 PERFORM pg_temp.race_assert(s->>'phase'='complete' AND (s->'scores'->>(s->'players'->starter->>'id'))::int=49000,'equal hands then finish; overshoot retained');
 -- Second actor independently reaches the target; a tied target remains a draw.
 v:=s||jsonb_build_object('phase','stage_complete','handInRound',1,'deadline',40000,
  'scores',jsonb_build_object(first_id::text,47000,second_id::text,48000));
 v:=private.race_poker_reduce(v,'tick',NULL,40000);
 PERFORM pg_temp.race_assert(v->>'phase'='complete' AND v->'scores'->>second_id::text='48000','second actor target completes equal round');
 v:=jsonb_set(v,'{scores}',jsonb_build_object(first_id::text,48000,second_id::text,48000));
 PERFORM pg_temp.race_assert((SELECT count(*)=2 FROM jsonb_each_text(v->'scores') WHERE value::int=48000),'equal target totals retain draw');
 -- Sixteen paired rounds / zero-client reducer path.
 s:=private.race_poker_deal(jsonb_build_object('rules',private.race_poker_rules(),'players',jsonb_build_array(jsonb_build_object('id',first_id),jsonb_build_object('id',second_id)),
  'identity',jsonb_build_object('dealerGameId',first_id,'roundId',second_id)),1000);
 FOR i IN 1..64 LOOP s:=private.race_poker_reduce(s,'tick',NULL,10000000);EXIT WHEN s->>'phase'='complete';END LOOP;
 PERFORM pg_temp.race_assert(s->>'phase'='complete' AND s->>'stage'='16' AND jsonb_array_length(s->'stages')=32,'cap at 16 equal paired rounds');
 PERFORM pg_temp.race_assert((SELECT bool_and(value::integer=0) FROM jsonb_each_text(s->'scores')),'zero-client draw');
 bot:=private.race_poker_bot_choice(ARRAY[0,13,1,14],ARRAY[26,2,12]);
 PERFORM pg_temp.race_assert(bot=0,'strategic bot chooses full house');
 FOR i IN 1..20 LOOP
  deck:=private.race_poker_shuffle();
  FOR j IN 0..4 LOOP
   bot:=private.race_poker_bot_choice(coalesce(deck[1:j],ARRAY[]::integer[]),deck[j+1:j+3]);
   PERFORM pg_temp.race_assert(bot BETWEEN 0 AND 2,'legal visible-only bot choice');
  END LOOP;
 END LOOP;
 PERFORM pg_temp.race_assert(position('race_poker_matches' in pg_get_functiondef('private.race_poker_bot_choice(integer[],integer[])'::regprocedure))=0,'policy has no match lookup');
END $$;
SELECT 'Race Poker scoring, deck, timing, equal hands, cap and visible-only policy PASS' proof;
