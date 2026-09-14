-- Phase-two qualification draft. Private journal encoding is intentionally raw;
-- all face expansion/projection happens on export, outside gameplay transactions.
CREATE OR REPLACE FUNCTION private.replay_gin_game_envelope_v1(_game public.games)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 -- Delivery cursors and snapshot revision order transport to live clients;
 -- replay has its own recorded order. They are not game state or finances.
 SELECT to_jsonb(_game)-ARRAY['replay_contract_version','authority_revision','chip_transfer_cursor','pot_transfer_cursor'];
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_visibility_v1(_state jsonb,_context jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('stock','[]'::jsonb,'discard','["public"]'::jsonb,
   'hands',CASE WHEN _state->>'phase' IN ('knocking','laying_off','scoring','complete') THEN '"public"'::jsonb ELSE _context->'users' END,
   'lastAction',CASE WHEN _state #>> '{lastAction,type}'='draw_stock' THEN
      coalesce(_context->'users'->(_state #>> '{lastAction,playerId}'),'null'::jsonb) ELSE '"public"'::jsonb END);
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_state_v1(_state jsonb,_context jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
 SELECT (_context->'checkpoint') || jsonb_build_object('gameState',_state,'scores',_state->'matchScores',
   'visibility',private.replay_gin_visibility_v1(_state,_context),
   'privateCatalog',jsonb_build_object('cardIds',_context->'cardIds','users',_context->'users'));
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_delta_v1(_before jsonb,_after jsonb,_context jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
 SELECT private.replay_diff_v1(_before,_after,ARRAY['gameState'])
   || private.replay_diff_v1(_before->'matchScores',_after->'matchScores',ARRAY['scores'])
   || private.replay_diff_v1(private.replay_gin_visibility_v1(_before,_context),private.replay_gin_visibility_v1(_after,_context),ARRAY['visibility']);
$fn$;

-- Exact edge is captured at the financial owner, never reconstructed from net
-- balances. A nested settlement contributes to its enclosing action's one row.
CREATE OR REPLACE FUNCTION private.replay_gin_note_transfer_v1(_game public.games,_from uuid,_to uuid,_amount integer,_result uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF _game.replay_contract_version=1 AND _amount>0 THEN
  PERFORM set_config('app.replay_gin_edges',jsonb_build_array(jsonb_build_object('id',_result::text,
   'from','player:'||_from::text,'to','player:'||_to::text,'amount',_amount,'reason','gin_terminal_settlement'))::text,true);
 END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.replay_gin_transition_v1(_context jsonb,_before jsonb,_after jsonb,
 _actor uuid,_action text,_card jsonb,_meld_index integer,_middle jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE
 v_steps jsonb:='[]'; v_previous jsonb:=_before; v_scores jsonb; v_action text; v_target text; v_middle jsonb; v_item jsonb;
 v_automatic_draw boolean:=_middle IS NOT NULL AND jsonb_typeof(_middle)='object';
 v_finance_delta jsonb;v_envelope_delta jsonb:='[]';
 v_edges jsonb:=coalesce(nullif(current_setting('app.replay_gin_edges',true),'')::jsonb,'[]');
 v_delta jsonb; v_edge jsonb; v_balances jsonb:=_context #> '{checkpoint,balances}'; v_key text;
 v_closing jsonb; v_ending jsonb; v_game public.games; v_round public.rounds; v_seq bigint; v_actual_balances jsonb;
 v_origin text:=CASE WHEN _actor IS NULL OR _action='finalize_scoring' THEN 'system' ELSE coalesce(_context->'origins'->>_actor::text,'player') END;
BEGIN
 IF _context IS NULL THEN RAISE EXCEPTION 'replay_v1:missing_gin_opening'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN v_automatic_draw THEN
  jsonb_build_array(jsonb_build_object('type','pass_first_draw','state',_middle)) ELSE coalesce(_middle,'[]') END) LOOP
  v_middle:=v_item->'state';
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','gin.'||(v_item->>'type'),'source','private.gin_apply_action_core','actorId',_actor,
   'targets',CASE WHEN _action='lay_off' THEN (SELECT jsonb_agg(key) FROM jsonb_each(_before->'playerStates') WHERE (value->>'hasKnocked')::boolean)
     ELSE '[]'::jsonb END,'origin',v_origin,'operands',jsonb_build_object('action',_action,'card',_card,'meldIndex',_meld_index),
   'delta',private.replay_gin_delta_v1(v_previous,v_middle,_context),'transfers','[]'::jsonb,'scores','[]'::jsonb));
  v_previous:=v_middle;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('counter',a.key,'before',(v_previous->'matchScores'->>a.key)::integer,
  'after',a.value::integer,'delta',a.value::integer-(v_previous->'matchScores'->>a.key)::integer,'reason',_action) ORDER BY a.key),'[]')
 INTO v_scores FROM jsonb_each_text(_after->'matchScores') a WHERE a.value IS DISTINCT FROM v_previous->'matchScores'->>a.key;
 v_action:=CASE WHEN v_automatic_draw THEN 'automatic_draw_stock' WHEN _action IN ('finish_lay_off','finalize_scoring') THEN 'score_resolved' ELSE _action END;
 v_target:=CASE WHEN v_automatic_draw THEN _before->>'nonDealerPlayerId' ELSE _after->>'currentTurnPlayerId' END;
 IF _action='lay_off' THEN
  SELECT key INTO v_target FROM jsonb_each(_before->'playerStates') WHERE coalesce((value->>'hasKnocked')::boolean,false) LIMIT 1;
 ELSIF _action='knock' THEN
  v_target:=CASE WHEN _actor::text=_before->>'dealerPlayerId' THEN _before->>'nonDealerPlayerId' ELSE _before->>'dealerPlayerId' END;
 ELSIF _after->>'winnerPlayerId' IS NOT NULL THEN v_target:=_after->>'winnerPlayerId'; END IF;
 v_delta:=private.replay_gin_delta_v1(v_previous,_after,_context);
 FOR v_edge IN SELECT value FROM jsonb_array_elements(v_edges) LOOP
  FOREACH v_key IN ARRAY ARRAY[v_edge->>'from',v_edge->>'to'] LOOP
   v_balances:=jsonb_set(v_balances,ARRAY[v_key],to_jsonb((v_balances->>v_key)::bigint+
     CASE WHEN v_key=v_edge->>'from' THEN -(v_edge->>'amount')::bigint ELSE (v_edge->>'amount')::bigint END));
  END LOOP;
 END LOOP;
 v_finance_delta:=private.replay_diff_v1(_context #> '{checkpoint,balances}',v_balances,ARRAY['balances']);
 IF _after->>'phase'='complete' THEN
  -- Necessary ending checkpoint: one indexed read per entity, only at close.
  SELECT * INTO v_game FROM public.games WHERE id=(_context #>> '{identity,sessionId}')::uuid;
  SELECT * INTO v_round FROM public.rounds WHERE id=(_context #>> '{identity,roundId}')::uuid;
  SELECT jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',v_game.pot) INTO v_actual_balances FROM public.players WHERE game_id=v_game.id;
  IF v_actual_balances IS DISTINCT FROM v_balances THEN RAISE EXCEPTION 'replay_v1:unrecorded_financial_change'; END IF;
  v_ending:=private.replay_gin_state_v1(_after,_context)||jsonb_build_object('balances',v_balances,
    'session',private.replay_gin_game_envelope_v1(v_game),'round',to_jsonb(v_round)-ARRAY['gin_rummy_state','authority_revision'],'roster',private.replay_gin_roster_v1(v_game.id));
  v_envelope_delta:=private.replay_diff_v1(_context #> '{checkpoint,session}',v_ending->'session',ARRAY['session'])
    ||private.replay_diff_v1(_context #> '{checkpoint,round}',v_ending->'round',ARRAY['round'])
    ||private.replay_diff_v1(_context #> '{checkpoint,roster}',v_ending->'roster',ARRAY['roster']);
  v_closing:=jsonb_build_object('scope','hand','identity',_context->'identity','disposition',
    CASE WHEN _after->'knockResult'='null'::jsonb THEN 'void' WHEN _after->>'winnerPlayerId' IS NOT NULL THEN v_game.status ELSE 'scored' END,
    'writerContract',_context #>> '{checkpoint,captureContract}','completeness',CASE WHEN _context #>> '{checkpoint,captureContract}'='gin-replay/1' THEN 'complete' ELSE 'partial' END,'endingState',v_ending,'balances',v_balances,'scores',_after->'matchScores');
 END IF;
 v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','gin.'||v_action,'source','private.gin_apply_action_core',
  'actorId',CASE WHEN v_automatic_draw OR v_action='score_resolved' THEN NULL ELSE _actor END,'targets',CASE WHEN v_target IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_target) END,
  'origin',CASE WHEN v_automatic_draw OR v_action='score_resolved' THEN 'system' ELSE v_origin END,'operands',jsonb_build_object('action',v_action,'card',_card,'meldIndex',_meld_index),
  'delta',v_delta,'transfers','[]'::jsonb,'scores',v_scores));
 IF v_edges<>'[]'::jsonb THEN
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','financial.transfer','source','public.gin_rummy_settle_game_legacy',
   'actorId',NULL,'targets',jsonb_build_array(v_target),'origin','system','operands','{}'::jsonb,'delta',v_finance_delta,'transfers',v_edges,'scores','[]'::jsonb));
 END IF;
 IF v_closing IS NOT NULL THEN
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','gin.hand_closed','source','private.gin_apply_action_core',
   'actorId',NULL,'targets','[]'::jsonb,'origin','system','operands',jsonb_build_object('disposition',v_closing->'disposition'),
   'delta',v_envelope_delta,'transfers','[]'::jsonb,'scores','[]'::jsonb));
 END IF;
 v_seq:=private.replay_append_v1((_context #>> '{identity,sessionId}')::uuid,
   'gin:'||(_context #>> '{identity,roundId}')||':action:'||(_before->>'actionCount'),_context->'identity',NULL,v_steps,v_closing);
 PERFORM set_config('app.replay_gin_edges','',true);
END;
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_postgame_v1(_game uuid,_round uuid,_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE v_before jsonb;v_after jsonb;v_identity jsonb;v_game public.games;v_round public.rounds;v_roster jsonb;v_balances jsonb;v_actor text;v_sub jsonb;
BEGIN
 SELECT body #> '{closing,endingState}',body->'identity' INTO v_before,v_identity FROM private.replay_steps
  WHERE session_id=_game AND body #>> '{identity,roundId}'=_round::text AND body ? 'closing' ORDER BY sequence DESC LIMIT 1;
 IF v_before IS NULL THEN RAISE EXCEPTION 'replay_v1:postgame_without_closing'; END IF;
 SELECT * INTO v_game FROM public.games WHERE id=_game;
 SELECT * INTO v_round FROM public.rounds WHERE id=_round;
 SELECT jsonb_agg(jsonb_build_object('playerId',id,'userId',user_id,'seat',position,'isBot',is_bot,'status',status) ORDER BY position,id),
  jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',v_game.pot) INTO v_roster,v_balances FROM public.players WHERE game_id=_game;
 IF v_balances IS DISTINCT FROM v_before->'balances' THEN RAISE EXCEPTION 'replay_v1:unrecorded_postgame_finance'; END IF;
 SELECT value->>'playerId' INTO v_actor FROM jsonb_array_elements(v_before->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1;
 v_after:=v_before||jsonb_build_object('session',private.replay_gin_game_envelope_v1(v_game),'round',to_jsonb(v_round)-ARRAY['gin_rummy_state','authority_revision'],'roster',private.replay_gin_roster_v1(_game));
 v_sub:=jsonb_build_object('type','gin.postgame','source','public.gin_rummy_advance_postgame','actorId',v_actor,'targets','[]'::jsonb,
  'origin',CASE WHEN v_actor IS NULL THEN 'system' ELSE 'player' END,'operands',_result,'delta',private.replay_diff_v1(v_before,v_after),'scores','[]'::jsonb,'transfers','[]'::jsonb);
 PERFORM private.replay_append_v1(_game,'gin:'||_round||':postgame',v_identity,NULL,jsonb_build_array(v_sub),jsonb_build_object(
  'scope','hand','identity',v_identity,'disposition',v_game.status,'writerContract',v_before->>'captureContract','completeness',CASE WHEN v_before->>'captureContract'='gin-replay/1' THEN 'complete' ELSE 'partial' END,'endingState',v_after,'balances',v_balances,'scores',v_after->'scores'));
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_game_envelope_v1(public.games),private.replay_gin_visibility_v1(jsonb,jsonb),private.replay_gin_note_transfer_v1(public.games,uuid,uuid,integer,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.replay_gin_postgame_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
