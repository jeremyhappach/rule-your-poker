-- Frozen independent Quintzee v1 scorer. No wildcard/joker substitution.
CREATE OR REPLACE FUNCTION private.quintzee_v1_category_score(category text,dice jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE total integer; biggest integer; distinct_i integer; spread integer; wanted integer;
BEGIN
 IF jsonb_typeof(dice) IS DISTINCT FROM 'array' OR jsonb_array_length(dice)<>5
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(dice) v WHERE v::text !~ '^[1-6]$') THEN RAISE EXCEPTION 'quintzee:invalid_dice';END IF;
 SELECT sum(v::text::int),count(DISTINCT v),max(v::text::int)-min(v::text::int) INTO total,distinct_i,spread FROM jsonb_array_elements(dice) v;
 SELECT max(n) INTO biggest FROM (SELECT count(*) n FROM jsonb_array_elements(dice) v GROUP BY v) counts;
 wanted:=array_position(ARRAY['ones','twos','threes','fours','fives','sixes'],category);
 IF wanted IS NOT NULL THEN RETURN wanted*(SELECT count(*)::int FROM jsonb_array_elements(dice) v WHERE v::text::int=wanted);END IF;
 CASE category
 WHEN 'three_of_a_kind' THEN RETURN CASE WHEN biggest>=3 THEN total ELSE 0 END;
 WHEN 'four_of_a_kind' THEN RETURN CASE WHEN biggest>=4 THEN total ELSE 0 END;
 WHEN 'yahtzee' THEN RETURN CASE WHEN biggest=5 THEN 50 ELSE 0 END;
 WHEN 'full_house' THEN RETURN CASE WHEN biggest=3 AND distinct_i=2 THEN 25 ELSE 0 END;
 WHEN 'large_straight' THEN RETURN CASE WHEN distinct_i=5 AND spread=4 THEN 40 ELSE 0 END;
 WHEN 'chance' THEN RETURN total;
 ELSE RAISE EXCEPTION 'quintzee:category';
 END CASE;
END $$;
REVOKE ALL ON FUNCTION private.quintzee_v1_category_score(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
