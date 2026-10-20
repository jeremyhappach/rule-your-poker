-- Only visible cards and public board-position history enter this policy.
CREATE OR REPLACE FUNCTION private.trip_flip_bot_choice(visible jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE move_i jsonb;best jsonb;src integer;dst integer;card integer;column_i jsonb;combo jsonb;utility integer;best_utility integer:=-100000;rank_i integer;natural_i integer;before_i jsonb;after_i jsonb;key_i text;
BEGIN
 FOR move_i IN SELECT value FROM jsonb_array_elements(visible->'legalMoves') LOOP
  src:=(move_i->>0)::integer;dst:=(move_i->>1)::integer;card:=(move_i->>2)::integer;combo:=NULL;
  IF src BETWEEN 4 AND 6 AND dst>=4 THEN CONTINUE;END IF;
  utility:=CASE WHEN src=7 THEN 30 WHEN src>=4 THEN 10 ELSE -15 END;
  IF dst>=4 THEN utility:=utility-20;
  ELSE
   column_i:=(visible->'columns'->dst)||jsonb_build_array(card);combo:=private.trip_flip_combination(column_i);
   IF combo IS NOT NULL THEN
    utility:=utility+CASE WHEN combo->>'kind'='trip' THEN 3000 ELSE 600 END;
    IF (combo->>'suited')::boolean THEN utility:=utility+5000;END IF;
    IF column_i=visible->'special' AND NOT (visible->>'specialClaimed')::boolean THEN utility:=utility+10000;END IF;
   ELSIF jsonb_array_length(column_i)=3 THEN utility:=utility-100;
   ELSIF jsonb_array_length(column_i)=2 THEN
    natural_i:=(column_i->>0)::integer;rank_i:=card%13-natural_i%13;
    utility:=utility+CASE WHEN card>=52 OR natural_i>=52 THEN 70 WHEN rank_i=0 THEN 65 WHEN abs(rank_i)=1 THEN 35 ELSE -30 END;
    IF column_i=(visible->'special')-2 THEN utility:=utility+80;END IF;
   END IF;
  END IF;
  -- Rearrangements must improve the board; never oscillate an unmatched card.
  IF src<4 AND combo IS NULL AND utility<=0 THEN CONTINUE;END IF;
  IF src<>7 THEN
   after_i:=visible;
   IF src<4 THEN after_i:=jsonb_set(after_i,ARRAY['columns',src::text],(after_i->'columns'->src)-(-1));
   ELSE after_i:=jsonb_set(after_i,ARRAY['cells',(src-4)::text],'null');END IF;
   IF dst<4 THEN after_i:=jsonb_set(after_i,ARRAY['columns',dst::text],CASE WHEN combo IS NOT NULL THEN '[]'::jsonb ELSE column_i END);
   ELSE after_i:=jsonb_set(after_i,ARRAY['cells',(dst-4)::text],to_jsonb(card));END IF;
   key_i:=md5(jsonb_build_array(after_i->'columns',after_i->'cells')::text);
   IF coalesce(visible->'recentPositions','[]'::jsonb) ? key_i THEN CONTINUE;END IF;
  END IF;
  IF utility>best_utility THEN best:=move_i;best_utility:=utility;END IF;
 END LOOP;
 RETURN CASE WHEN best IS NULL THEN jsonb_build_object('action','take_score') ELSE jsonb_build_object('action','move','items',best) END;
END $$;
REVOKE ALL ON FUNCTION private.trip_flip_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
