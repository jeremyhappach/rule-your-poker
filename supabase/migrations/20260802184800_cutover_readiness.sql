-- Cutover readiness is intentionally inert until the setting below is enabled.
-- It freezes application writes without changing game lifecycle or balances.
INSERT INTO public.system_settings (key, value)
VALUES ('cutover_write_lock', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cutover_write_lock_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT value ->> 'enabled' = 'true'
      FROM public.system_settings
     WHERE key = 'cutover_write_lock'
  ), false);
$$;

REVOKE ALL ON FUNCTION public.cutover_write_lock_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cutover_write_lock_active() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_cutover_write_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.cutover_write_bypass', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF public.cutover_write_lock_active() THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Application writes are temporarily locked for backend cutover.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_cutover_write_lock() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_cutover_write_lock_triggers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  table_row record;
  installed integer := 0;
BEGIN
  FOR table_row IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('r', 'p')
       AND relation.relname <> 'system_settings'
     ORDER BY relation.relname
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS enforce_cutover_write_lock ON %I.%I',
      table_row.schema_name,
      table_row.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER enforce_cutover_write_lock '
      'BEFORE INSERT OR UPDATE OR DELETE ON %I.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_cutover_write_lock()',
      table_row.schema_name,
      table_row.table_name
    );
    installed := installed + 1;
  END LOOP;

  RETURN installed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_cutover_write_lock_triggers() FROM PUBLIC, anon, authenticated, service_role;

SELECT public.refresh_cutover_write_lock_triggers();

-- Storage is outside the public schema, so enforce the same flag through
-- restrictive policies. service_role remains the controlled import bypass.
DROP POLICY IF EXISTS cutover_write_lock_insert_guard ON storage.objects;
DROP POLICY IF EXISTS cutover_write_lock_update_guard ON storage.objects;
DROP POLICY IF EXISTS cutover_write_lock_delete_guard ON storage.objects;

CREATE POLICY cutover_write_lock_insert_guard
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (NOT public.cutover_write_lock_active());

CREATE POLICY cutover_write_lock_update_guard
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (NOT public.cutover_write_lock_active())
WITH CHECK (NOT public.cutover_write_lock_active());

CREATE POLICY cutover_write_lock_delete_guard
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (NOT public.cutover_write_lock_active());

-- Preserve real-money history and financial rows while allowing the target
-- rehearsal/final import to discard fake-money sessions. The original purge
-- missed Cribbage archives because that table intentionally has no FK.
CREATE OR REPLACE FUNCTION public.admin_delete_fake_money_games()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_game_ids uuid[];
  v_dealer_game_ids uuid[];
  v_round_ids uuid[];
  v_player_ids uuid[];
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT array_agg(id) INTO v_game_ids
    FROM public.games
   WHERE real_money = false;

  IF v_game_ids IS NULL OR array_length(v_game_ids, 1) IS NULL THEN
    DELETE FROM public.cribbage_hand_archive AS archive
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.games AS game_row
        WHERE game_row.id = archive.game_id
     );
    RETURN 0;
  END IF;

  SELECT array_agg(id) INTO v_dealer_game_ids
    FROM public.dealer_games
   WHERE session_id = ANY(v_game_ids);

  SELECT array_agg(id) INTO v_round_ids
    FROM public.rounds
   WHERE game_id = ANY(v_game_ids)
      OR (v_dealer_game_ids IS NOT NULL AND dealer_game_id = ANY(v_dealer_game_ids));

  SELECT array_agg(id) INTO v_player_ids
    FROM public.players
   WHERE game_id = ANY(v_game_ids);

  IF v_round_ids IS NOT NULL THEN
    DELETE FROM public.cribbage_events WHERE round_id = ANY(v_round_ids);
    DELETE FROM public.player_actions WHERE round_id = ANY(v_round_ids);
    DELETE FROM public.player_cards WHERE round_id = ANY(v_round_ids);
    DELETE FROM public.dice_roll_audit WHERE round_id = ANY(v_round_ids);
    UPDATE public.rounds SET predecessor_round_id = NULL WHERE id = ANY(v_round_ids);
  END IF;

  IF v_player_ids IS NOT NULL THEN
    DELETE FROM public.game_results WHERE winner_player_id = ANY(v_player_ids);
    DELETE FROM public.chip_stack_emoticons WHERE player_id = ANY(v_player_ids);
  END IF;

  DELETE FROM public.cribbage_hand_archive AS archive
   WHERE archive.game_id = ANY(v_game_ids)
      OR NOT EXISTS (
        SELECT 1
          FROM public.games AS game_row
         WHERE game_row.id = archive.game_id
      );
  DELETE FROM public.session_events WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.game_results WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.session_player_snapshots WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chat_messages WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chat_send_operations WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chat_operation_reports WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chip_stack_emoticons WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.dice_roll_audit WHERE game_id = ANY(v_game_ids);

  IF v_round_ids IS NOT NULL THEN
    DELETE FROM public.rounds WHERE id = ANY(v_round_ids);
  END IF;
  DELETE FROM public.rounds WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.dealer_games WHERE session_id = ANY(v_game_ids);
  DELETE FROM public.players WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.games WHERE id = ANY(v_game_ids);

  v_count := array_length(v_game_ids, 1);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_fake_money_games() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_fake_money_games() TO authenticated;
