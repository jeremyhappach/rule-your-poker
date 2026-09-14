CREATE OR REPLACE FUNCTION private.replay_append_v1(_session uuid, _source text, _identity jsonb,
  _opening jsonb, _substeps jsonb, _closing jsonb DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private AS $fn$
DECLARE v_seq bigint; v_body jsonb;
BEGIN
  IF _session IS NULL OR nullif(_source,'') IS NULL OR (_identity->>'sessionId')::uuid IS DISTINCT FROM _session
     OR jsonb_typeof(_substeps) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'replay_v1:invalid_step'; END IF;
  -- Only the explicitly qualified hand writer may issue a complete hand seal.
  -- Legacy contexts lack this contract and can never be promoted.
  IF _closing IS NOT NULL AND _closing->>'completeness' IS DISTINCT FROM 'partial'
    AND (_closing->>'writerContract' IS DISTINCT FROM 'gin-replay/1' OR _closing->>'scope' IS DISTINCT FROM 'hand') THEN
    RAISE EXCEPTION 'replay_v1:unqualified_writer_cannot_seal';
  END IF;
  v_seq := nextval('private.replay_sequence_v1');
  v_body := jsonb_build_object('sequence',v_seq::text,'sourceKey',_source,'identity',_identity,'substeps',_substeps);
  IF _opening IS NOT NULL THEN v_body := v_body || jsonb_build_object('opening',_opening); END IF;
  IF _closing IS NOT NULL THEN v_body := v_body || jsonb_build_object('closing',_closing || jsonb_build_object('finalSequence',v_seq::text)); END IF;
  INSERT INTO private.replay_steps(session_id,sequence,source_key,body) VALUES(_session,v_seq,_source,v_body);
  RETURN v_seq;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.replay_gin_open_v1(_game public.games, _round public.rounds, _state jsonb, _rules jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, private AS $fn$
DECLARE v_context jsonb; v_cards jsonb; v_players jsonb; v_users jsonb; v_balances jsonb; v_identity jsonb; v_origins jsonb;
BEGIN
  IF _game.replay_contract_version IS NULL THEN RETURN; END IF;
  SELECT jsonb_agg(jsonb_build_object('playerId',id,'userId',user_id,'seat',position,'isBot',is_bot,'status',status) ORDER BY position,id),
         jsonb_object_agg(id::text,user_id),jsonb_object_agg('player:'||id::text,chips),jsonb_object_agg(id::text,CASE WHEN is_bot THEN 'bot' ELSE 'player' END)
    INTO v_players,v_users,v_balances,v_origins FROM public.players WHERE game_id=_game.id;
  SELECT jsonb_object_agg(private.gin_card_key(card),gen_random_uuid()::text) INTO v_cards
    FROM (SELECT value card FROM jsonb_array_elements((_state->'stockPile')||(_state->'discardPile'))
          UNION ALL SELECT card.value FROM jsonb_each(_state->'playerStates') p CROSS JOIN LATERAL jsonb_array_elements(p.value->'hand') card) cards;
  v_identity := jsonb_build_object('sessionId',_game.id,'dealerGameId',_round.dealer_game_id,'handNumber',_round.hand_number,'roundId',_round.id);
  v_context := jsonb_build_object('identity',v_identity,'cardIds',v_cards,'users',v_users,'origins',v_origins,
    'checkpoint',jsonb_build_object('captureContract','gin-replay/1','roster',private.replay_gin_roster_v1(_game.id),'session',to_jsonb(_game)-ARRAY['replay_contract_version','authority_revision','chip_transfer_cursor','pot_transfer_cursor'],
      'round',to_jsonb(_round)-ARRAY['gin_rummy_state','authority_revision'],'rules',jsonb_build_object('contract','gin-rummy/1','config',_rules),
      'balances',v_balances||jsonb_build_object('pot',_game.pot),'scores',_state->'matchScores'));
  INSERT INTO private.replay_streams(session_id,contract,coverage,writer_contract)
    VALUES(_game.id,'ptown-replay/1','hand_boundary','gin-replay/1') ON CONFLICT(session_id) DO NOTHING;
  UPDATE private.gin_rummy_round_states SET replay_context_v1=v_context WHERE round_id=_round.id;
  PERFORM private.replay_append_v1(_game.id,'gin:'||_round.id::text||':opening',v_identity,
    jsonb_build_object('state',private.replay_gin_state_v1(_state,v_context),'coverage','hand_boundary','rules',v_context #> '{checkpoint,rules}'),'[]');
END;
$fn$;
