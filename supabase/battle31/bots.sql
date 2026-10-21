CREATE OR REPLACE FUNCTION private.battle31_bot_choice(v jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor int:=(v->>'turnIndex')::int;opponent int:=1-actor;hand jsonb:=v->'hands'->actor;center jsonb:=v->'center';known jsonb:=v->'known'->opponent;samples jsonb;sample jsonb;candidate jsonb;newcenter jsonb;trial jsonb;value_i numeric;oppvalue numeric;utility numeric;best numeric:=-1e9;bestscore numeric:=-1;choice jsonb;option_i int;i int;j int;card_i int;action_i text;items_i jsonb;final_i boolean:=(v->>'closing')::boolean OR (v->>'turn')::int=8;
BEGIN
 IF hand @> '[null]'::jsonb THEN RAISE EXCEPTION 'battle31:bot_projection';END IF;
 -- Fixed bounded sample of possible hands. Input is the actor projection only.
 SELECT jsonb_agg(h) INTO samples FROM (SELECT jsonb_build_array(a,b,c) h FROM generate_series(0,31) a,generate_series(0,31) b,generate_series(0,31) c
 WHERE a<b AND b<c AND NOT hand @> to_jsonb(a) AND NOT hand @> to_jsonb(b) AND NOT hand @> to_jsonb(c)
 AND NOT center @> to_jsonb(a) AND NOT center @> to_jsonb(b) AND NOT center @> to_jsonb(c)
 AND jsonb_build_array(a,b,c) @> known ORDER BY md5(jsonb_build_array(a,b,c)::text||hand::text||center::text) LIMIT 16) possible;
 FOR option_i IN 0..10 LOOP
  candidate:=hand;newcenter:=center;items_i:=NULL;action_i:='pass';
  IF option_i=10 THEN candidate:=center;newcenter:=hand;action_i:='take_pot';
  ELSIF option_i>0 THEN i:=(option_i-1)/3;j:=(option_i-1)%3;candidate:=jsonb_set(hand,ARRAY[i::text],center->j);newcenter:=jsonb_set(center,ARRAY[j::text],hand->i);action_i:='swap';items_i:=jsonb_build_array(hand->i,center->j);END IF;
  value_i:=private.battle31_score(candidate);utility:=0;
  FOR sample IN SELECT value FROM jsonb_array_elements(samples) LOOP
   oppvalue:=private.battle31_score(sample);
   IF NOT final_i AND value_i<31 THEN
    oppvalue:=greatest(oppvalue,private.battle31_score(newcenter));
    FOR i IN 0..2 LOOP FOR j IN 0..2 LOOP trial:=jsonb_set(sample,ARRAY[i::text],newcenter->j);oppvalue:=greatest(oppvalue,private.battle31_score(trial));END LOOP;END LOOP;
   END IF;
   utility:=utility+CASE WHEN value_i>=31 THEN 1 ELSE sign(value_i-oppvalue) END;
  END LOOP;
  IF utility>best OR utility=best AND value_i>bestscore THEN best:=utility;bestscore:=value_i;choice:=jsonb_build_object('action',action_i,'items',items_i);END IF;
 END LOOP;
 RETURN choice;
END $$;
