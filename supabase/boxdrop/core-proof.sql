CREATE OR REPLACE FUNCTION pg_temp.box_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Boxdrop proof: %',label;END IF;END $$;
-- Fixture injection exists only in this rolled-back proof, never a game RPC.
CREATE OR REPLACE FUNCTION pg_temp.box_put(b jsonb,scale_i integer,value_i integer,at_ms bigint DEFAULT 4000) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 b:=jsonb_set(b,'{current,value}',to_jsonb(value_i));
 RETURN private.boxdrop_board_reduce(b,'place',ARRAY[scale_i,(b#>>'{current,id}')::integer],at_ms);
END $$;
DO $$
DECLARE b jsonb;v jsonb;w jsonb;q jsonb;initial jsonb;rules jsonb:=private.boxdrop_rules();i integer;j integer;ordinal integer;expected integer;value_i integer;
BEGIN
 b:=private.boxdrop_board_deal(jsonb_build_object('rules',rules,'score',0),1000);
 PERFORM pg_temp.box_assert(jsonb_array_length(b->'scales')=4 AND b->>'recycleIndicator'='6000','four independent scales and six unused slots');
 PERFORM pg_temp.box_assert(private.boxdrop_board_reduce(b,'tick',NULL,3499)=b,'intro excludes active clock');
 b:=private.boxdrop_board_reduce(b,'tick',NULL,3500);initial:=b;
 PERFORM pg_temp.box_assert(b->>'deadline'='103500','100 second active deadline');
 v:=private.boxdrop_board_reduce(b,'take_score',NULL,3500);
 PERFORM pg_temp.box_assert(v->>'score'='0' AND v#>>'{result,bonusEligible}'='false','A: no-action bank earns zero');
 v:=pg_temp.box_put(b,0,2);
 PERFORM pg_temp.box_assert((private.boxdrop_board_reduce(v,'take_score',NULL,4000)->>'score')::bigint=40,'B: one box only partial credit');
 q:='[]';
 FOR i IN 1..6 LOOP
  q:=q||jsonb_build_array((b->'current')||'{"recycled":true}'::jsonb);
  b:=private.boxdrop_board_reduce(b,'recycle',ARRAY[(b#>>'{current,id}')::integer],4000);
  PERFORM pg_temp.box_assert(b->'queue'=q AND (b->>'freshDraws')::int=i+1 AND (b->>'recycleIndicator')::int=1000*(6-i),'FIFO append with one fresh draw');
 END LOOP;
 FOR i IN 1..30 LOOP
  w:=b->'current';v:=b->'queue'->0;
  b:=private.boxdrop_board_reduce(b,'recycle',ARRAY[(b#>>'{current,id}')::integer],4000);
  PERFORM pg_temp.box_assert(b->'current'=v AND b->'queue'=((q-0)||jsonb_build_array(w||'{"recycled":true}'::jsonb)) AND b->>'freshDraws'='7','full FIFO rotates without fresh draw');
  q:=b->'queue';
 END LOOP;
 PERFORM pg_temp.box_assert((private.boxdrop_board_reduce(b,'take_score',NULL,4000)->>'score')::int=0,'C: recycling loop cannot bank bonuses');
 v:=pg_temp.box_put(b,0,1);
 PERFORM pg_temp.box_assert(v->'queue'=b->'queue' AND v->>'freshDraws'='8' AND v#>>'{scales,0,boxes,0,recycled}'='true','recycled placement preserves white and then draws fresh');
 b:=initial;
 FOR i IN 1..5 LOOP b:=pg_temp.box_put(b,0,5);END LOOP;
 b:=pg_temp.box_put(b,0,7);
 PERFORM pg_temp.box_assert(b#>>'{scales,0,stage}'='2' AND b#>>'{scales,0,sum}'='0' AND b->>'score'='3200','sixth-slot exact 32 wins before exhaustion');
 v:=private.boxdrop_board_reduce(b,'take_score',NULL,4000);
 PERFORM pg_temp.box_assert(v#>>'{result,speedBonus}'='19900' AND v#>>'{result,recyclingBonus}'='6000' AND v->>'score'='29100','D: eligible speed and recycling paid once');
 BEGIN PERFORM private.boxdrop_board_reduce(v,'take_score',NULL,4001);RAISE EXCEPTION 'duplicate bank accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'boxdrop:phase' THEN RAISE;END IF;END;
 FOR i IN 0..200 LOOP
  v:=private.boxdrop_board_finish(b,'take_score',103500-i*500);
  PERFORM pg_temp.box_assert((v#>>'{result,speedBonus}')::int=i*100,'speed exact 500ms floor');
  IF i<200 THEN
   v:=private.boxdrop_board_finish(b,'take_score',103499-i*500);
   PERFORM pg_temp.box_assert((v#>>'{result,speedBonus}')::int=i*100,'speed partial interval floors down');
  END IF;
 END LOOP;
 v:=private.boxdrop_board_deal(b||'{"score":29100}',200000);
 v:=private.boxdrop_board_reduce(v,'take_score',NULL,202500);
 PERFORM pg_temp.box_assert(v->>'score'='29100' AND v#>>'{result,bonusEligible}'='false','E: earlier-round qualification resets');
 v:=b;
 FOR i IN 1..3 LOOP v:=pg_temp.box_put(v,0,7);END LOOP;
 PERFORM pg_temp.box_assert(v#>>'{scales,0,status}'='closed' AND v->>'score'='8200','third-slot exact 21 closes');
 b:=initial;
 FOR i IN 0..3 LOOP
  FOR j IN 1..3 LOOP b:=pg_temp.box_put(b,i,11);END LOOP;
 END LOOP;
 PERFORM pg_temp.box_assert(b->>'phase'='stage_complete' AND b->>'score'='0' AND b#>>'{result,speedBonus}'='0' AND b#>>'{result,recyclingBonus}'='0','F: four failed scales without 32 earn zero');
 b:=initial;
 FOR i IN 1..6 LOOP b:=pg_temp.box_put(b,0,1);END LOOP;
 PERFORM pg_temp.box_assert(b#>>'{scales,0,status}'='short' AND b->>'score'='120','six slots short pays partial once');
 v:=private.boxdrop_board_reduce(b,'take_score',NULL,4000);
 PERFORM pg_temp.box_assert(v->>'score'='120' AND v#>>'{result,partialPoints}'='120','bank never replays retired partial');
 BEGIN PERFORM pg_temp.box_put(b,0,1);RAISE EXCEPTION 'retired accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'boxdrop:illegal_move' THEN RAISE;END IF;END;
 b:=initial;
 FOR i IN 0..3 LOOP
  b:=pg_temp.box_put(b,i,11);b:=pg_temp.box_put(b,i,11);b:=pg_temp.box_put(b,i,10);
  b:=pg_temp.box_put(b,i,11);b:=pg_temp.box_put(b,i,10);
  PERFORM pg_temp.box_assert((b->>'closures')::int=i+1,'successful closure ordinal');
  PERFORM pg_temp.box_assert((b->>'closurePoints')::int=(ARRAY[5000,15000,30000,55000])[i+1],'closure award schedule');
 END LOOP;
 PERFORM pg_temp.box_assert(b#>>'{result,reason}'='full_clear' AND b#>>'{result,firstOrderPoints}'='12800' AND b#>>'{result,closurePoints}'='55000' AND b#>>'{result,partialPoints}'='0','all-clear base 67800 with no extra award');
 PERFORM pg_temp.box_assert(b->>'freshDraws'='20','no unnecessary fresh draw on terminal placement');
 v:=pg_temp.box_put(initial,0,9);v:=private.boxdrop_board_reduce(v,'take_score',NULL,103500);
 PERFORM pg_temp.box_assert(v->>'score'='0' AND v#>>'{result,reason}'='timeout','late bank times out without partial');
 v:=private.boxdrop_board_reduce(initial,'place',ARRAY[0,(initial#>>'{current,id}')::int],103500);
 PERFORM pg_temp.box_assert(v->>'score'='0' AND v#>>'{result,reason}'='timeout','deadline placement never scores');
 PERFORM pg_temp.box_assert(private.boxdrop_required_rounds(99999)=2 AND private.boxdrop_required_rounds(100000)=3,'exact bonus qualification boundary');
 FOR i IN 1..500 LOOP
  v:=private.boxdrop_fresh(initial);value_i:=(v#>>'{current,value}')::int;
  PERFORM pg_temp.box_assert(value_i BETWEEN 1 AND 11,'fresh supported domain');
 END LOOP;
 PERFORM pg_temp.box_assert(NOT private.boxdrop_visible(v)?'freshDraws' AND NOT private.boxdrop_visible(v)?'serial','internal draw accounting redacted');
END $$;
SELECT 'Boxdrop core: FIFO, exact-slot precedence, retirement, 67800 all-clear, bonus amendment A–F, 401 speed edges, deadline priority PASS' AS proof;
