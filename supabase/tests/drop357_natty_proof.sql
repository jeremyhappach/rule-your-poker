-- Run inside a rollback transaction after installing the candidate.
CREATE FUNCTION pg_temp.assert_natty(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '357 natty: %',label;END IF;
END $$;
CREATE TEMP TABLE natty_cases(name text,cards integer[],lane integer,category text,points integer,bonus integer,is_natural boolean,selected jsonb) ON COMMIT DROP;
INSERT INTO natty_cases VALUES
 ('screenshot',ARRAY[47,8,39,43,11,49,44],7,'Flush',1320,264,true,'[0,2,3,5,6]'::jsonb),
 ('flush suit substitution',ARRAY[47,8,39,43,11,49,31],7,'Flush',1350,0,false,'[0,2,3,5,6]'::jsonb),
 ('fives natural flush',ARRAY[47,39,43,49,42],5,'Flush',1320,264,true,NULL),
 ('fives substituted suit',ARRAY[47,39,43,49,3],5,'Flush',1350,0,false,NULL),
 ('printed interior straight',ARRAY[2,29,17,44,6],5,'Straight',930,186,true,NULL),
 ('printed lower straight pays more',ARRAY[29,17,44,6,33],5,'Straight',940,188,true,NULL),
 ('straight requires rank substitution',ARRAY[4,29,19,46,8],5,'Straight',950,0,false,NULL),
 ('printed straight flush pays more',ARRAY[42,43,44,45,46],5,'Straight flush',2990,598,true,NULL),
 ('higher category needs wild',ARRAY[42,44,45,46,47],5,'Straight flush',3010,0,false,NULL),
 ('natural pair',ARRAY[48,9,16],3,'Pair',370,74,true,NULL),
 ('wild trips beat printed pair',ARRAY[48,9,14],3,'Trips',1720,0,false,NULL),
 ('printed wild-rank pair',ARRAY[40,1,26],3,'Trips',800,0,false,NULL),
 ('printed wild-rank trips',ARRAY[40,1,27],3,'Trips',2240,0,false,NULL),
 ('natural threes-row trips',ARRAY[44,5,31],3,'Trips',1170,234,true,NULL),
 ('printed fives trips become aces quads',ARRAY[42,3,29,51,24],5,'Quads',2400,0,false,NULL),
 ('printed fives quads become five aces',ARRAY[42,3,29,16,12],5,'Five of a kind',4650,0,false,NULL),
 ('printed full house needs wild for winning category',ARRAY[42,3,29,51,12],5,'Five of a kind',4650,0,false,NULL),
 ('printed pair fives in full house',ARRAY[51,12,38,42,3],5,'Five of a kind',4650,0,false,NULL),
 ('natural full house',ARRAY[51,12,38,50,11],5,'Full house',1853,371,true,NULL),
 ('natural quads',ARRAY[51,12,38,25,44],5,'Quads',2400,480,true,NULL),
 ('natural trips',ARRAY[51,12,38,24,44],5,'Trips',700,140,true,NULL),
 ('pair of fives upgraded',ARRAY[42,3,51,11,13],5,'Trips',700,0,false,NULL),
 ('two pair containing fives upgraded',ARRAY[42,3,50,11,26],5,'Quads',2380,0,false,NULL),
 ('unused wild cannot remove natural',ARRAY[49,47,43,39,41,5,24],7,'Flush',1320,264,true,'[0,1,2,3,4]'::jsonb),
 ('unrelated natural flush cannot bless wild straight flush',ARRAY[43,45,46,47,39,5,24],7,'Straight flush',3000,0,false,NULL),
 ('sevens printed straight',ARRAY[42,4,31,19,7,13,50],7,'Straight',940,188,true,NULL),
 ('sevens printed straight flush',ARRAY[42,43,44,45,46,13,11],7,'Straight flush',2990,598,true,NULL),
 ('zero stays zero',ARRAY[39,28,17],3,'High card',0,0,false,NULL),
 ('royal stays natural',ARRAY[47,48,49,50,51],5,'Royal flush',3700,740,true,NULL);
DO $$
DECLARE f record;r jsonb;
BEGIN
 FOR f IN SELECT * FROM natty_cases LOOP
  r:=private.drop357_lane(f.cards,f.lane,private.drop357_v7_rules());
  PERFORM pg_temp.assert_natty(r->>'category'=f.category AND (r->>'points')::integer=f.points
   AND (r->>'bonus')::integer=f.bonus AND (r->>'score')::integer=f.points+f.bonus
   AND (r->>'natural')::boolean=f.is_natural AND (f.selected IS NULL OR r->'selected'=f.selected),f.name||': '||r);
 END LOOP;
 PERFORM pg_temp.assert_natty(private.drop357_lane(ARRAY[47,8,39,43,11,49,44],7,private.drop357_v6_rules())->>'score'='1350','frozen /6 screenshot');
 PERFORM pg_temp.assert_natty((private.drop357_v7_rules()-ARRAY['version','naturalPolicy','selection'])=(private.drop357_v6_rules()-'version'),'unchanged matrix, clocks and multipliers');
 PERFORM pg_temp.assert_natty(private.arcade_score_group('357-drop','357-drop/7')=private.arcade_score_group('357-drop','357-drop/6'),'existing high-score history retained');
 PERFORM pg_temp.assert_natty(NOT has_function_privilege('authenticated','private.drop357_v7_lane(integer[],integer,jsonb)','execute') AND NOT has_function_privilege('service_role','private.drop357_v7_lane(integer[],integer,jsonb)','execute'),'private scorer permissions');
 BEGIN PERFORM private.drop357_lane(ARRAY[47,8,39,43,11,49,44],7,jsonb_set(private.drop357_v7_rules(),'{naturalPercent}','99'));RAISE EXCEPTION 'tampered config accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'357:rules' THEN RAISE;END IF;END;
END $$;
SELECT 'PASS: 29 printed/wild scoring fixtures, frozen /6, matrix, score groups, permission and configuration guards' result;
