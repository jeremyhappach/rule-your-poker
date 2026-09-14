-- Qualification draft. Not a production migration and not an enabled recorder.
-- Private payloads include secrets; only a future historical-perspective exporter
-- may release them. No API grants or Realtime publication membership are added.
CREATE SEQUENCE private.replay_sequence_v1 AS bigint CACHE 1;
CREATE TABLE private.replay_streams (
  session_id uuid PRIMARY KEY,
  contract text NOT NULL CHECK (contract = 'ptown-replay/1'),
  coverage text NOT NULL CHECK (coverage IN ('session_genesis','hand_boundary','legacy_partial')),
  writer_contract text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.replay_steps (
  session_id uuid NOT NULL REFERENCES private.replay_streams(session_id),
  sequence bigint NOT NULL,
  source_key text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  PRIMARY KEY (session_id, sequence),
  UNIQUE (session_id, source_key)
);
ALTER TABLE private.replay_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.replay_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.replay_streams, private.replay_steps FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.replay_sequence_v1 FROM PUBLIC, anon, authenticated, service_role;

-- This nullable marker is read from the game's already-locked row. Enrollment
-- remains explicit in qualification fixtures until every writer is supported.
ALTER TABLE public.games ADD COLUMN replay_contract_version smallint
  CHECK (replay_contract_version = 1);
ALTER TABLE private.gin_rummy_round_states ADD COLUMN replay_context_v1 jsonb;

CREATE FUNCTION private.replay_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'replay_v1:append_only'; END;
$fn$;
CREATE TRIGGER replay_steps_immutable BEFORE UPDATE OR DELETE ON private.replay_steps
FOR EACH ROW EXECUTE FUNCTION private.replay_immutable_v1();
CREATE TRIGGER replay_streams_immutable BEFORE UPDATE OR DELETE ON private.replay_streams
FOR EACH ROW EXECUTE FUNCTION private.replay_immutable_v1();

-- Pure OLD/NEW diff. It never reads live tables or the journal. Arrays use one
-- prefix/suffix splice; unchanged objects and scalars produce no operations.
CREATE FUNCTION private.replay_diff_v1(_before jsonb, _after jsonb, _path text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE
  v_out jsonb := '[]'; v_key text; v_a integer; v_b integer;
  v_prefix integer := 0; v_suffix integer := 0; v_removed jsonb; v_inserted jsonb;
BEGIN
  IF _before IS NOT DISTINCT FROM _after THEN RETURN v_out; END IF;
  IF jsonb_typeof(_before)='object' AND jsonb_typeof(_after)='object'
     AND _before->>'kind' IS DISTINCT FROM 'card' AND _after->>'kind' IS DISTINCT FROM 'card'
     AND NOT (_before ? 'rank' AND _before ? 'suit') AND NOT (_after ? 'rank' AND _after ? 'suit') THEN
    FOR v_key IN
      SELECT coalesce(b.key,a.key) FROM jsonb_each(_before) b FULL JOIN jsonb_each(_after) a USING(key)
      WHERE b.value IS DISTINCT FROM a.value ORDER BY coalesce(b.key,a.key)
    LOOP
      IF v_key IN ('__proto__','constructor','prototype') THEN RAISE EXCEPTION 'replay_v1:unsafe_key'; END IF;
      IF NOT (_after ? v_key) THEN
        v_out := v_out || jsonb_build_array(jsonb_build_object('op','remove','path',_path||v_key,'before',_before->v_key));
      ELSIF NOT (_before ? v_key) THEN
        v_out := v_out || jsonb_build_array(jsonb_build_object('op','set','path',_path||v_key,'existed',false,'before',NULL,'value',_after->v_key));
      ELSIF jsonb_typeof(_before->v_key) IS DISTINCT FROM jsonb_typeof(_after->v_key)
         OR jsonb_typeof(_before->v_key) NOT IN ('object','array') OR v_key='lastAction' THEN
        v_out := v_out || jsonb_build_array(jsonb_build_object('op','set','path',_path||v_key,'existed',true,'before',_before->v_key,'value',_after->v_key));
      ELSE
        v_out := v_out || private.replay_diff_v1(_before->v_key,_after->v_key,_path||v_key);
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(_before)='array' AND jsonb_typeof(_after)='array' THEN
    v_a := jsonb_array_length(_before); v_b := jsonb_array_length(_after);
    WHILE v_prefix < least(v_a,v_b) AND _before->v_prefix = _after->v_prefix LOOP v_prefix := v_prefix+1; END LOOP;
    WHILE v_suffix < least(v_a,v_b)-v_prefix AND _before->(v_a-v_suffix-1) = _after->(v_b-v_suffix-1) LOOP v_suffix := v_suffix+1; END LOOP;
    SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO v_removed FROM jsonb_array_elements(_before) WITH ORDINALITY WHERE ordinality>v_prefix AND ordinality<=v_a-v_suffix;
    SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO v_inserted FROM jsonb_array_elements(_after) WITH ORDINALITY WHERE ordinality>v_prefix AND ordinality<=v_b-v_suffix;
    v_out := jsonb_build_array(jsonb_build_object('op','splice','path',_path,'index',v_prefix,'removed',v_removed,'inserted',v_inserted));
  ELSE
    IF cardinality(_path)=0 THEN RAISE EXCEPTION 'replay_v1:root_replacement_requires_checkpoint'; END IF;
    v_out := jsonb_build_array(jsonb_build_object('op','set','path',_path,'existed',true,'before',_before,'value',_after));
  END IF;
  RETURN v_out;
END;
$fn$;

-- Call only after the authoritative owner acquired its existing session lock.
-- The sequence is allocated there, not at request arrival. Gaps are legal.
-- Duplicate source keys fail the whole transaction: owners must use their
-- existing replay/idempotency guard before mutating gameplay a second time.
CREATE FUNCTION private.replay_append_v1(_session uuid, _source text, _identity jsonb,
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

-- Recursively replaces card values in replay data ONLY. Never changes cards
-- used by game logic. IDs are random per hand and their face map stays private.
-- Visibility is attached to each historical occurrence, not to the object's
-- future identity: later grants cannot reveal an earlier hidden occurrence.
CREATE FUNCTION private.replay_gin_cards_v1(_value jsonb, _context jsonb, _state jsonb, _path text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, private AS $fn$
DECLARE v_result jsonb; v_key text; v_item jsonb; v_audience jsonb := '[]'; v_player text; v_id text;
BEGIN
  IF jsonb_typeof(_value)='object' THEN
    IF _value ? 'rank' AND _value ? 'suit' THEN
      v_id := _context->'cardIds'->>private.gin_card_key(_value);
      IF v_id IS NULL THEN RAISE EXCEPTION 'replay_v1:unregistered_card'; END IF;
      IF _path[1]='discardPile' THEN v_audience := '["public"]';
      ELSIF _path[1]='playerStates' THEN
        v_player := _path[2];
        IF _state->>'phase' IN ('knocking','laying_off','scoring','complete') THEN v_audience := '["public"]';
        ELSIF _context->'users'->>v_player IS NOT NULL THEN v_audience := jsonb_build_array(_context->'users'->>v_player); END IF;
      ELSIF _path[1]='lastAction' THEN
        IF _state #>> '{lastAction,type}' IS DISTINCT FROM 'draw_stock' THEN v_audience := '["public"]';
        ELSIF _context->'users'->>(_state #>> '{lastAction,playerId}') IS NOT NULL THEN v_audience := jsonb_build_array(_context->'users'->>(_state #>> '{lastAction,playerId}')); END IF;
      END IF;
      RETURN jsonb_build_object('kind','card','objectId',v_id,'face',_value,'visibleTo',v_audience);
    END IF;
    v_result := '{}';
    FOR v_key,v_item IN SELECT key,value FROM jsonb_each(_value) LOOP
      v_result := v_result || jsonb_build_object(v_key,private.replay_gin_cards_v1(v_item,_context,_state,_path||v_key));
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(_value)='array' THEN
    SELECT coalesce(jsonb_agg(private.replay_gin_cards_v1(value,_context,_state,_path||(ordinality-1)::text) ORDER BY ordinality),'[]') INTO v_result
      FROM jsonb_array_elements(_value) WITH ORDINALITY;
    RETURN v_result;
  END IF;
  RETURN _value;
END;
$fn$;

CREATE FUNCTION private.replay_gin_state_v1(_state jsonb, _context jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, private AS $fn$
  SELECT (_context->'checkpoint') || jsonb_build_object(
    'gameState',private.replay_gin_cards_v1(_state,_context,_state),
    'scores',coalesce(_state->'matchScores','{}'::jsonb));
$fn$;

CREATE FUNCTION private.replay_gin_open_v1(_game public.games, _round public.rounds, _state jsonb, _rules jsonb)
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

-- Active-play path: diff the already-loaded authority values first and convert
-- ONLY changed operands. Full state conversion is reserved for checkpoints.
CREATE FUNCTION private.replay_gin_delta_v1(_before jsonb, _after jsonb, _context jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, private AS $fn$
DECLARE
  v_result jsonb := '[]'; v_op jsonb; v_path text[];
  v_reveal_changed boolean := coalesce(_before->>'phase' IN ('knocking','laying_off','scoring','complete'),false)
    IS DISTINCT FROM coalesce(_after->>'phase' IN ('knocking','laying_off','scoring','complete'),false);
BEGIN
  FOR v_op IN SELECT value FROM jsonb_array_elements(private.replay_diff_v1(_before,_after)) LOOP
    SELECT array_agg(value ORDER BY ordinality) INTO v_path FROM jsonb_array_elements_text(v_op->'path') WITH ORDINALITY;
    -- lastAction's card grant depends on action type/actor even if the card is
    -- unchanged. Hand grants similarly change with the recorded reveal phase.
    IF v_path[1]='lastAction' OR (v_reveal_changed AND v_path[1]='playerStates') THEN CONTINUE; END IF;
    IF v_op->>'op'='splice' THEN
      v_op := v_op || jsonb_build_object('removed',private.replay_gin_cards_v1(v_op->'removed',_context,_before,v_path),
        'inserted',private.replay_gin_cards_v1(v_op->'inserted',_context,_after,v_path));
    ELSE
      v_op := v_op || jsonb_build_object('before',private.replay_gin_cards_v1(v_op->'before',_context,_before,v_path));
      IF v_op->>'op'='set' THEN v_op := v_op || jsonb_build_object('value',private.replay_gin_cards_v1(v_op->'value',_context,_after,v_path)); END IF;
    END IF;
    v_result := v_result || jsonb_build_array(v_op || jsonb_build_object('path',ARRAY['gameState']||v_path));
  END LOOP;
  IF _before->'lastAction' IS DISTINCT FROM _after->'lastAction' THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object('op','set','path',ARRAY['gameState','lastAction'],'existed',true,
      'before',private.replay_gin_cards_v1(_before->'lastAction',_context,_before,ARRAY['lastAction']),
      'value',private.replay_gin_cards_v1(_after->'lastAction',_context,_after,ARRAY['lastAction'])));
  END IF;
  IF v_reveal_changed THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object('op','set','path',ARRAY['gameState','playerStates'],'existed',true,
      'before',private.replay_gin_cards_v1(_before->'playerStates',_context,_before,ARRAY['playerStates']),
      'value',private.replay_gin_cards_v1(_after->'playerStates',_context,_after,ARRAY['playerStates'])));
  END IF;
  RETURN v_result || private.replay_diff_v1(_before->'matchScores',_after->'matchScores',ARRAY['scores']);
END;
$fn$;

CREATE FUNCTION private.replay_gin_transition_v1(_context jsonb, _before jsonb, _after jsonb,
  _actor uuid, _action text, _card jsonb, _meld_index integer, _middle jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private AS $fn$
DECLARE v_steps jsonb := '[]'; v_previous jsonb := _before; v_scores jsonb; v_action text; v_target text;
BEGIN
  IF _context IS NULL THEN RAISE EXCEPTION 'replay_v1:missing_gin_opening'; END IF;
  IF _middle IS NOT NULL THEN
    v_steps := jsonb_build_array(jsonb_build_object('type','gin.pass_first_draw','source','private.gin_apply_action_core','actorId',_actor,
      'targets',jsonb_build_array(_before->>'nonDealerPlayerId'),'origin','player','operands',jsonb_build_object('action',_action),
      'delta',private.replay_gin_delta_v1(_before,_middle,_context),'transfers','[]'::jsonb,'scores','[]'::jsonb));
    v_previous := _middle;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('counter',a.key,'before',(v_previous->'matchScores'->>a.key)::integer,
      'after',a.value::integer,'delta',a.value::integer-(v_previous->'matchScores'->>a.key)::integer,'reason',_action) ORDER BY a.key),'[]')
    INTO v_scores FROM jsonb_each_text(_after->'matchScores') a WHERE a.value IS DISTINCT FROM v_previous->'matchScores'->>a.key;
  v_action := CASE WHEN _middle IS NULL THEN _action ELSE 'automatic_draw_stock' END;
  v_target := CASE WHEN _middle IS NULL THEN _after->>'currentTurnPlayerId' ELSE _before->>'nonDealerPlayerId' END;
  v_steps := v_steps || jsonb_build_array(jsonb_build_object('type','gin.'||v_action,'source','private.gin_apply_action_core','actorId',CASE WHEN _middle IS NULL THEN _actor ELSE NULL END,
    'targets',CASE WHEN v_target IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_target) END,'origin',CASE WHEN _middle IS NULL THEN 'player' ELSE 'system' END,
    'operands',jsonb_build_object('action',v_action,'card',CASE WHEN _card IS NULL THEN NULL ELSE private.replay_gin_cards_v1(_card,_context,_after,ARRAY['lastAction','card']) END,'meldIndex',_meld_index),
    'delta',private.replay_gin_delta_v1(v_previous,_after,_context),'transfers','[]'::jsonb,'scores',v_scores));
  PERFORM private.replay_append_v1((_context #>> '{identity,sessionId}')::uuid,
    'gin:'||(_context #>> '{identity,roundId}')||':action:'||(_before->>'actionCount'),_context->'identity',NULL,v_steps);
END;
$fn$;

REVOKE ALL ON FUNCTION private.replay_immutable_v1(), private.replay_diff_v1(jsonb,jsonb,text[]),
 private.replay_append_v1(uuid,text,jsonb,jsonb,jsonb,jsonb), private.replay_gin_cards_v1(jsonb,jsonb,jsonb,text[]),
 private.replay_gin_state_v1(jsonb,jsonb), private.replay_gin_open_v1(public.games,public.rounds,jsonb,jsonb),private.replay_gin_delta_v1(jsonb,jsonb,jsonb),
 private.replay_gin_transition_v1(jsonb,jsonb,jsonb,uuid,text,jsonb,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
