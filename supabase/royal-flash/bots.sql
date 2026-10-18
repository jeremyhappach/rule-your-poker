-- Decisions receive only the same public board a human sees. No deck access.
CREATE FUNCTION private.royal_flash_bot_choice(v jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE slot integer;candidate jsonb;quality bigint;best bigint:=-1;best_slot integer;line integer;cards jsonb;rank_pairs integer;suit_pairs integer;
BEGIN
 IF v->>'phase' NOT IN('ready','playing') OR at_ms>=(v->>'deadline')::bigint THEN RETURN NULL;END IF;
 FOR slot IN 0..24 LOOP
  candidate:=jsonb_set(v->'slots',ARRAY[slot::text],v->'current');
  SELECT sum((x->>'points')::bigint)*100 INTO quality FROM jsonb_array_elements(private.royal_flash_lines(candidate,v->'rules'))x;
  -- Small visible-only potential rewards help complete compatible rows/columns.
  FOR line IN 0..9 LOOP
   SELECT jsonb_agg(candidate->(CASE WHEN line<5 THEN line*5+i ELSE i*5+line-5 END)) INTO cards FROM generate_series(0,4)i;
   SELECT coalesce(sum(n*(n-1)),0) INTO rank_pairs FROM(SELECT count(*)::integer n FROM jsonb_array_elements_text(cards)c WHERE c IS NOT NULL GROUP BY c::integer%13)t;
   SELECT coalesce(sum(n*(n-1)),0) INTO suit_pairs FROM(SELECT count(*)::integer n FROM jsonb_array_elements_text(cards)c WHERE c IS NOT NULL GROUP BY c::integer/13)t;
   quality:=quality+rank_pairs*20+suit_pairs*10;
  END LOOP;
  IF v->'slots'->slot='null'::jsonb THEN quality:=quality+5000;END IF;
  IF quality>best THEN best:=quality;best_slot:=slot;END IF;
 END LOOP;
 RETURN jsonb_build_object('action','place','index',best_slot);
END $$;
REVOKE ALL ON FUNCTION private.royal_flash_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
