-- Versioned ranked offers. The two-argument scorer remains the frozen /1-/3 owner.
CREATE OR REPLACE FUNCTION private.horses_blitz_set(dice jsonb,roll integer,cfg jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE wild integer;rank_i integer;n integer;size_i integer;best_size integer:=0;best_rank integer:=0;
 natural_i boolean:=false;base_i integer;points integer;matrix jsonb:=cfg->'matrix';
BEGIN
 IF cfg->>'version'<>'horses-blitz/4' THEN RETURN private.horses_blitz_set(dice,roll);END IF;
 -- Validate all faces and the roll through the retained boundary.
 PERFORM private.horses_blitz_set(dice,roll);
 SELECT count(*) INTO wild FROM jsonb_array_elements(dice)d WHERE d='1'::jsonb;
 IF wild=5 THEN best_size:=5;best_rank:=1;natural_i:=true;base_i:=2600;
 ELSE
  FOR rank_i IN 2..6 LOOP
   SELECT count(*) INTO n FROM jsonb_array_elements(dice)d WHERE d=to_jsonb(rank_i);
   size_i:=n+wild;
   IF size_i>best_size OR size_i=best_size AND rank_i>best_rank THEN
    best_size:=size_i;best_rank:=rank_i;natural_i:=size_i>=2 AND wild=0;
   END IF;
  END LOOP;
  -- A one outside the chosen meld cannot remove natural status. With a usable
  -- wild, adding it always produces the higher-priority larger meld.
  base_i:=(matrix->(greatest(1,best_size)-1)->>(best_rank-2))::integer;
 END IF;
 points:=round(base_i*(CASE roll WHEN 1 THEN 1.30 WHEN 2 THEN 1.10 ELSE 1.00 END)*(CASE WHEN natural_i THEN 1.20 ELSE 1 END));
 RETURN jsonb_build_object('size',best_size,'rank',best_rank,'natural',natural_i,'base',base_i,'points',points,
  'label',CASE best_size WHEN 1 THEN 'High card' WHEN 2 THEN 'Pair of '||best_rank||'s' WHEN 3 THEN 'Three '||best_rank||'s' WHEN 4 THEN 'Four '||best_rank||'s' WHEN 5 THEN 'Five '||best_rank||'s' END);
END $$;
REVOKE ALL ON FUNCTION private.horses_blitz_set(jsonb,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
