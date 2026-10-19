-- Pure board values: no historical/session/financial writes. Run against installed rules.
BEGIN;
DO $$
DECLARE b jsonb; r jsonb; version_i int; blocked boolean;
BEGIN
 FOR version_i IN 1..3 LOOP
  r:=CASE version_i WHEN 1 THEN private.royal_flash_rules()
   WHEN 2 THEN private.royal_flash_rules_v2() ELSE private.royal_flash_rules_v3() END;
  b:=private.royal_flash_board_deal(jsonb_build_object('rules',r,'score',0),1000);
  blocked:=false;
  BEGIN
   PERFORM private.royal_flash_board_reduce(b,'place',ARRAY[0],3499);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='royal_flash:intro' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  ASSERT blocked;
  ASSERT private.royal_flash_board_reduce(b,'place',ARRAY[0],3500)->>'phase'='playing';
  ASSERT (private.royal_flash_board_reduce(b,'place',ARRAY[0],3500)->>'placements')::int=1;
  ASSERT private.royal_flash_board_reduce(b,'place',ARRAY[0],23500)#>>'{result,reason}'='ready_timeout';
 END LOOP;
END $$;
ROLLBACK;
