-- Run after migration 20260929144536 inside BEGIN/ROLLBACK; no historical session writes.
CREATE FUNCTION pg_temp.assert_harness(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'run21_harness_proof:%',label; END IF; END $$;
CREATE TEMP TABLE harness_probe (LIKE private.run21_matches INCLUDING DEFAULTS) ON COMMIT DROP;
CREATE TRIGGER capture BEFORE INSERT OR UPDATE OF debug_harness ON harness_probe
  FOR EACH ROW EXECUTE FUNCTION private.run21_capture_harness();
DO $$
DECLARE fake uuid; real_game uuid; chosen text; loaded text;
BEGIN
  SELECT id INTO STRICT fake FROM public.games WHERE real_money=false LIMIT 1;
  SELECT id INTO real_game FROM public.games WHERE real_money=true LIMIT 1;
  PERFORM pg_temp.assert_harness(NOT has_table_privilege('authenticated','private.run21_matches','UPDATE'),'private_authority');
  PERFORM pg_temp.assert_harness(NOT has_function_privilege('authenticated','private.run21_capture_harness()','EXECUTE'),'no_client_selector');
  INSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":true}')
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
  FOREACH chosen IN ARRAY ARRAY['always_104','always_105','none','unknown'] LOOP
    UPDATE public.game_defaults SET debug_harness=chosen WHERE game_type='run21';
    INSERT INTO harness_probe(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,debug_harness)
      VALUES(gen_random_uuid(),fake,gen_random_uuid(),'[]',1,'{}','{}','always_105') RETURNING debug_harness INTO loaded;
    PERFORM pg_temp.assert_harness(loaded=CASE WHEN chosen IN('always_104','always_105') THEN chosen ELSE 'none' END,'server_capture_'||chosen);
  END LOOP;
  UPDATE public.game_defaults SET debug_harness='always_105' WHERE game_type='run21';
  UPDATE public.system_settings SET value='{"enabled":false}' WHERE key='harnesses_mode';
  INSERT INTO harness_probe(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,debug_harness)
    VALUES(gen_random_uuid(),fake,gen_random_uuid(),'[]',1,'{}','{}','always_105') RETURNING debug_harness INTO loaded;
  PERFORM pg_temp.assert_harness(loaded='none','master_off_ignores_forged_input');
  PERFORM pg_temp.assert_harness(EXISTS(SELECT 1 FROM harness_probe WHERE debug_harness='always_104'),'continuation_frozen_despite_global_change');
  BEGIN
    UPDATE harness_probe SET debug_harness='none' WHERE debug_harness='always_104';
    RAISE EXCEPTION 'mutable_harness';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:harness_frozen' THEN RAISE; END IF; END;
  UPDATE harness_probe SET debug_harness=debug_harness,finished=true;
  PERFORM pg_temp.assert_harness(EXISTS(SELECT 1 FROM harness_probe WHERE finished AND debug_harness='always_104'),'terminal_preserves_receipt');
  UPDATE public.system_settings SET value='{"enabled":true}' WHERE key='harnesses_mode';
  -- Missing/non-fake games must fail closed even with an active global profile.
  INSERT INTO harness_probe(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances)
    VALUES(gen_random_uuid(),coalesce(real_game,gen_random_uuid()),gen_random_uuid(),'[]',1,'{}','{}') RETURNING debug_harness INTO loaded;
  PERFORM pg_temp.assert_harness(loaded='none','non_fake_fail_closed');
END $$;
SELECT 'capture, off, unknown, spoof, frozen continuation, terminal and access checks passed' AS proof;
