-- LockRows precedes LIMIT: locked sessions do not consume the 20-row budget.
-- Every selected row holds the round/session/match locks before calling the
-- existing command or postgame owner. No alternate reducer or settlement path.
CREATE OR REPLACE FUNCTION private.battle31_recover() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; m private.battle31_matches; g public.games;
 actor uuid; action_i text; req uuid;
 at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 FOR candidate IN
  SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,
   work.state->>'dealId' deal_id,work.state->>'phase' phase,
   work.state->>'turnIndex' turn_index
  FROM public.rounds r
  JOIN public.games live ON live.id=r.game_id
  JOIN private.battle31_matches work ON work.round_id=r.id AND work.game_id=live.id AND work.dealer_game_id=r.dealer_game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   -- Lock every existing participant before the LIMIT as well. A busy player
   -- row must not repeatedly consume a slot and starve later sessions.
   AND (SELECT count(*) FROM (SELECT p.id FROM public.players p
        WHERE p.game_id=work.game_id FOR UPDATE SKIP LOCKED) claimed)
       =(SELECT count(*) FROM public.players p WHERE p.game_id=work.game_id)
   AND live.current_game_uuid=work.dealer_game_id AND live.game_type='battle-31'
   AND live.status='in_progress' AND NOT live.is_paused
   AND ((work.state->>'deadline')::bigint<=at_ms OR work.state->>'phase'='playing'
    AND coalesce(work.bot_due_at,0)<=at_ms
    AND EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=work.game_id AND p.id=(work.state->'players'->(work.state->>'turnIndex')::int->>'id')::uuid AND (p.is_bot OR p.auto_fold)))
  ORDER BY (work.state->>'deadline')::bigint,work.dealer_game_id
  LIMIT 20 FOR UPDATE OF r,live,work SKIP LOCKED
 LOOP
  SELECT * INTO STRICT g FROM public.games WHERE id=candidate.game_id;
  SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=candidate.dealer_game_id;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'battle-31'
   OR g.status<>'in_progress' OR g.is_paused OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.revision<>candidate.revision
   OR m.state->>'dealId' IS DISTINCT FROM candidate.deal_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'turnIndex' IS DISTINCT FROM candidate.turn_index THEN CONTINUE;END IF;
  actor:=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid;
  IF m.state->>'phase'='playing' AND EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND (is_bot OR auto_fold)) THEN action_i:='bot';
  ELSIF (m.state->>'deadline')::bigint<=at_ms THEN action_i:='tick';
  ELSE CONTINUE;END IF;
  req:=md5(m.dealer_game_id::text||':'||m.revision||':service')::uuid;
  BEGIN
   -- A player/accounting writer outside the normal session lock contract must
   -- not block the entire batch either. Release partial locks on NOWAIT failure.
   PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE NOWAIT;
   PERFORM private.battle31_commit(m.dealer_game_id,req,m.revision,actor,action_i,NULL);
  EXCEPTION WHEN lock_not_available THEN CONTINUE;
   WHEN raise_exception THEN IF SQLERRM NOT IN('battle31:stale_revision','battle31:inactive','battle31:deadline') THEN RAISE;END IF;
  END;
 END LOOP;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 FOR candidate IN
  SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision
  FROM public.rounds r
  JOIN public.games live ON live.id=r.game_id
  JOIN private.battle31_matches work ON work.round_id=r.id AND work.game_id=live.id AND work.dealer_game_id=r.dealer_game_id
  WHERE NOT work.finished AND work.settlement IS NOT NULL
   AND (work.state#>>'{terminal,deadline}')::bigint<=at_ms
   -- Lock every existing participant before the LIMIT as well. A busy player
   -- row must not repeatedly consume a slot and starve later sessions.
   AND (SELECT count(*) FROM (SELECT p.id FROM public.players p
        WHERE p.game_id=work.game_id FOR UPDATE SKIP LOCKED) claimed)
       =(SELECT count(*) FROM public.players p WHERE p.game_id=work.game_id)
   AND live.current_game_uuid=work.dealer_game_id AND live.game_type='battle-31'
   AND live.status IN('game_over','session_ended') AND NOT live.is_paused
  ORDER BY (work.state#>>'{terminal,deadline}')::bigint,work.dealer_game_id
  LIMIT 20 FOR UPDATE OF r,live,work SKIP LOCKED
 LOOP
  SELECT * INTO STRICT g FROM public.games WHERE id=candidate.game_id;
  SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=candidate.dealer_game_id;
  IF m.finished OR m.settlement IS NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id
   OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'battle-31'
   OR g.status NOT IN('game_over','session_ended') OR g.is_paused THEN CONTINUE;END IF;
  BEGIN
   PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE NOWAIT;
   PERFORM private.battle31_finish_postgame(m.dealer_game_id);
  EXCEPTION WHEN lock_not_available THEN CONTINUE;
  END;
 END LOOP;
END $$;
