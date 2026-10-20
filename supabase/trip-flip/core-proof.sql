CREATE OR REPLACE FUNCTION pg_temp.trip_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Trip Flip proof: %',label;END IF;END $$;
DO $$
DECLARE b jsonb;v jsonb;w jsonb;fixture jsonb;rules jsonb:=private.trip_flip_rules();i integer;j integer;k integer;r integer;s integer;move_i jsonb;src integer;dst integer;card integer;count_i integer:=0;
BEGIN
 FOR i IN 1..50 LOOP
  b:=private.trip_flip_board_deal(jsonb_build_object('rules',rules,'score',0),1000);
  PERFORM pg_temp.trip_assert((SELECT count(DISTINCT c)=54 FROM jsonb_array_elements(b->'deck')c) AND b->>'cursor'='3' AND jsonb_array_length(b->'fan')=3,'unique 54 card pack and three fan');
  PERFORM pg_temp.trip_assert(private.trip_flip_combination(b->'special')->>'kind'='run','valid natural Special target');
 END LOOP;
 PERFORM pg_temp.trip_assert(NOT(private.trip_flip_visible(b)?'deck') AND NOT(private.trip_flip_visible(b)?'cursor'),'private stock');
 PERFORM pg_temp.trip_assert(private.trip_flip_board_reduce(b,'tick',NULL,3499)=b,'intro outside active time');
 b:=private.trip_flip_board_reduce(b,'tick',NULL,3500);
 PERFORM pg_temp.trip_assert(b->>'deadline'='183500','180 seconds after intro');
 FOR i IN 0..30 LOOP
  PERFORM pg_temp.trip_assert(private.trip_flip_dots(b,183500-i*6000)=i,'exact dot boundary');
  IF i<30 THEN PERFORM pg_temp.trip_assert(private.trip_flip_dots(b,183499-i*6000)=i+1,'partial dot remains lit');END IF;
 END LOOP;
 PERFORM pg_temp.trip_assert(private.trip_flip_dots(b,183501)=0 AND private.trip_flip_dots(b,0)=30,'timer clamps');
 -- All ranks, suit combinations and physical run directions.
 FOR r IN 0..12 LOOP
  PERFORM pg_temp.trip_assert(private.trip_flip_combination(jsonb_build_array(r,r+13,r+26))->>'kind'='trip','natural Trip');
  PERFORM pg_temp.trip_assert(private.trip_flip_combination(jsonb_build_array(52,r,53))->>'kind'='trip','two Jokers resolve highest base');
  FOR i IN 0..2 LOOP
   v:=jsonb_set(jsonb_build_array(r,r+13,r+26),ARRAY[i::text],'52');
   PERFORM pg_temp.trip_assert(private.trip_flip_combination(v)->>'kind'='trip','single Joker Trip in every position');
  END LOOP;
 END LOOP;
 FOR r IN 0..10 LOOP FOR s IN 0..3 LOOP
  v:=jsonb_build_array(r+13*s,r+1+13*s,r+2+13*s);
  PERFORM pg_temp.trip_assert(private.trip_flip_combination(v)->>'kind'='run' AND (private.trip_flip_combination(v)->>'suited')::boolean,'suited ascending Run');
  PERFORM pg_temp.trip_assert(private.trip_flip_combination(jsonb_build_array(v->2,v->1,v->0))->>'kind'='run','descending Run');
  FOR i IN 0..2 LOOP
   w:=private.trip_flip_combination(jsonb_set(v,ARRAY[i::text],'52'));
   PERFORM pg_temp.trip_assert(w->>'kind'='run' AND NOT (w->>'suited')::boolean AND NOT (w->>'natural')::boolean,'Joker Run no suited');
  END LOOP;
 END LOOP;END LOOP;
 PERFORM pg_temp.trip_assert(private.trip_flip_combination('[11,12,0]') IS NULL AND private.trip_flip_combination('[12,0,1]') IS NULL AND private.trip_flip_combination('[2,0,1]') IS NULL,'Ace low and physical order');
 fixture:=b||'{"columns":[[0,13],[1],[2],[]],"cells":[3,null,4],"fan":[26,5,6],"cursor":7,"special":[0,1,2]}'::jsonb;
 FOR move_i IN SELECT value FROM jsonb_array_elements(private.trip_flip_moves(fixture)) LOOP
  src:=(move_i->>0)::integer;dst:=(move_i->>1)::integer;card:=(move_i->>2)::integer;
  v:=private.trip_flip_board_reduce(fixture,'move',ARRAY[src,dst,card],4000);count_i:=count_i+1;
  PERFORM pg_temp.trip_assert(v->'deadline'=fixture->'deadline','moves do not reset clock');
  IF src=7 THEN PERFORM pg_temp.trip_assert(v->>'cursor'='8' AND v->'fan'->0='5'::jsonb,'fan shifts and replenishes');END IF;
 END LOOP;
 PERFORM pg_temp.trip_assert(count_i>20,'all source/destination kinds exercised');
 v:=private.trip_flip_board_reduce(fixture,'move',ARRAY[7,0,26],4000);
 PERFORM pg_temp.trip_assert(v->>'score'='3000' AND v->'columns'->0='[]'::jsonb AND v->>'trips'='1','Trip auto clear and award');
 fixture:=b||'{"columns":[[0,1],[],[],[]],"cells":[null,null,null],"fan":[2,5,6],"special":[0,1,2]}'::jsonb;
 v:=private.trip_flip_board_reduce(fixture,'move',ARRAY[7,0,2],4000);
 PERFORM pg_temp.trip_assert(v->>'score'='15600' AND v->>'specialClaimed'='true','base plus suited plus Special stack');
 w:=private.trip_flip_board_reduce(fixture||'{"specialClaimed":true}'::jsonb,'move',ARRAY[7,0,2],4000);
 PERFORM pg_temp.trip_assert(w->>'score'='5600','Special once per round');
 w:=private.trip_flip_board_reduce(fixture||'{"fan":[52,5,6]}'::jsonb,'move',ARRAY[7,0,52],4000);
 PERFORM pg_temp.trip_assert(w->>'score'='600' AND w->>'specialClaimed'='false','Joker never Special/suited');
 w:=private.trip_flip_board_reduce(fixture||'{"fan":[9,5,6]}'::jsonb,'move',ARRAY[7,0,9],4000);
 PERFORM pg_temp.trip_assert(w->'columns'->0='[0,1,9]'::jsonb AND w->>'score'='0','nonmatch stays');
 FOR i IN 0..7 LOOP FOR j IN 0..7 LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(private.trip_flip_moves(w))m WHERE m=jsonb_build_array(i,j,private.trip_flip_card(w,i))) THEN CONTINUE;END IF;
  BEGIN PERFORM private.trip_flip_board_reduce(w,'move',ARRAY[i,j,coalesce(private.trip_flip_card(w,i),0)],4001);RAISE EXCEPTION 'illegal accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'trip_flip:illegal_move' THEN RAISE;END IF;END;
 END LOOP;END LOOP;
 BEGIN PERFORM private.trip_flip_board_reduce(fixture,'move',ARRAY[0,1,0],4000);RAISE EXCEPTION 'buried accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'trip_flip:illegal_move' THEN RAISE;END IF;END;
 BEGIN PERFORM private.trip_flip_board_reduce(fixture,'move',ARRAY[7,1,5],4000);RAISE EXCEPTION 'back fan accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'trip_flip:illegal_move' THEN RAISE;END IF;END;
 v:=private.trip_flip_board_reduce(b,'take_score',NULL,3500);
 PERFORM pg_temp.trip_assert(v#>>'{result,timeBonus}'='3750' AND v->>'score'='3750','early zero-combination bank');
 v:=private.trip_flip_board_reduce(fixture,'move',ARRAY[7,0,2],183500);
 PERFORM pg_temp.trip_assert(v#>>'{result,reason}'='timeout' AND v->>'score'='0','exact deadline precedes scoring move');
 v:=private.trip_flip_board_reduce(fixture||'{"cursor":54,"fan":[2]}'::jsonb,'move',ARRAY[7,0,2],4000);
 PERFORM pg_temp.trip_assert(v#>>'{result,reason}'='full_clear' AND v->>'score'='19350' AND v#>>'{result,timeBonus}'='3750','full exhaustion banks only combo plus dots');
 v:=private.trip_flip_board_reduce(fixture||'{"cursor":54,"fan":[9]}'::jsonb,'move',ARRAY[7,0,9],4000);
 PERFORM pg_temp.trip_assert(v->>'phase'='playing' AND v->'fan'='[]'::jsonb,'stock exhaustion alone does not end');
END $$;
SELECT 'Trip Flip core: movement, classification, awards, 62 clock edges and exhaustion PASS' AS proof;
