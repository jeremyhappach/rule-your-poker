CREATE OR REPLACE FUNCTION private.battle31_recover() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.battle31_matches;actor uuid;choice jsonb;action_i text;items_i int[];req uuid;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 FOR m IN SELECT work.* FROM private.battle31_matches work JOIN public.games g ON g.id=work.game_id WHERE NOT work.finished AND work.settlement IS NULL AND g.current_game_uuid=work.dealer_game_id AND g.status='in_progress' AND NOT g.is_paused
 AND ((work.state->>'deadline')::bigint<=at_ms OR work.state->>'phase'='playing' AND coalesce(work.bot_due_at,0)<=at_ms AND (work.state->'players'->(work.state->>'turnIndex')::int->>'isBot')::boolean) ORDER BY (work.state->>'deadline')::bigint LIMIT 20 LOOP
  actor:=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid;items_i:=NULL;
  IF (m.state->>'deadline')::bigint<=at_ms THEN action_i:='tick';
  ELSE choice:=private.battle31_bot_choice(private.battle31_visible(m.state,actor));action_i:=choice->>'action';SELECT array_agg(value::int) INTO items_i FROM jsonb_array_elements_text(coalesce(nullif(choice->'items','null'),'[]'));
  END IF;
  req:=md5(m.dealer_game_id::text||':'||m.revision||':service')::uuid;
  BEGIN PERFORM private.battle31_commit(m.dealer_game_id,req,m.revision,actor,action_i,items_i);
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN('battle31:stale_revision','battle31:inactive','battle31:deadline') THEN RAISE;END IF;END;
 END LOOP;
 FOR m IN SELECT * FROM private.battle31_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms LOOP PERFORM private.battle31_finish_postgame(m.dealer_game_id);END LOOP;
END $$;
