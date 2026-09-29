-- Run21 setup only: retain every dealer/session/config/replay/authorization guard.
DO $migration$
DECLARE definition text; previous text;
BEGIN
  definition:=pg_get_functiondef('public.run21_configure_local(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure);
  previous:=definition;
  definition:=replace(definition,E'    OR (SELECT count(*) FROM public.players WHERE game_id=g.id AND status=''active'' AND NOT sitting_out AND is_bot)<>1\n','');
  IF definition=previous OR position('run21:one_player_and_one_bot_required' IN definition)=0 THEN
    RAISE EXCEPTION 'run21:configure_definition_drift';
  END IF;
  definition:=replace(definition,'run21:one_player_and_one_bot_required','run21:two_eligible_players_required');
  EXECUTE definition;
END $migration$;
