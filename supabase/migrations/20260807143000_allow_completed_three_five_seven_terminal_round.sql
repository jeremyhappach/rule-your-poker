-- Normal 3-5-7 round resolution claims its work by changing the round from
-- betting to completed before it awards the winning leg. The terminal RPC
-- must accept that exact completed-round state; its immutable identity,
-- winner, authorization, and durable settlement-claim checks remain the
-- authoritative admission boundary.

DO $migration$
DECLARE
  v_function_sql text;
  v_rewritten_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.three_five_seven_settle_game(uuid,uuid,uuid,integer)'::regprocedure
  )
    INTO v_function_sql;

  IF v_function_sql LIKE '%v_round.status NOT IN (''betting'', ''completed'')%' THEN
    RETURN;
  END IF;

  v_rewritten_sql := replace(
    v_function_sql,
    'v_round.status = ''completed''',
    'v_round.status NOT IN (''betting'', ''completed'')'
  );

  IF v_rewritten_sql = v_function_sql THEN
    RAISE EXCEPTION
      'allow_completed_three_five_seven_terminal_round:expected_guard_not_found';
  END IF;

  EXECUTE v_rewritten_sql;
END;
$migration$;

COMMENT ON FUNCTION public.three_five_seven_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and idempotently settles one authoritative terminal 3-5-7 game, including the completed round claimed by normal final-leg resolution.';
