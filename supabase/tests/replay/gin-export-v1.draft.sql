-- Replay export reads only the durable journal and recorded membership. It does
-- not consult rounds, players, games, profiles, current rules, or an RNG.
CREATE FUNCTION private.replay_apply_delta_v1(_state jsonb,_delta jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE v_op jsonb; v_path text[]; v_old jsonb; v_new jsonb; v_index integer; v_count integer;
BEGIN
 FOR v_op IN SELECT value FROM jsonb_array_elements(_delta) LOOP
  SELECT array_agg(value ORDER BY ordinality) INTO v_path FROM jsonb_array_elements_text(v_op->'path') WITH ORDINALITY;
  v_old:=_state #> v_path;
  IF v_op->>'op'='set' THEN
   IF (v_old IS NOT NULL) IS DISTINCT FROM (v_op->>'existed')::boolean OR ((v_op->>'existed')::boolean AND v_old IS DISTINCT FROM v_op->'before') THEN RAISE EXCEPTION 'replay_v1:set_precondition'; END IF;
   _state:=jsonb_set(_state,v_path,v_op->'value',true);
  ELSIF v_op->>'op'='remove' THEN
   IF v_old IS DISTINCT FROM v_op->'before' THEN RAISE EXCEPTION 'replay_v1:remove_precondition'; END IF;
   _state:=_state #- v_path;
  ELSIF v_op->>'op'='splice' THEN
   v_index:=(v_op->>'index')::integer; v_count:=jsonb_array_length(v_op->'removed');
   SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO v_new FROM jsonb_array_elements(v_old) WITH ORDINALITY
    WHERE ordinality>v_index AND ordinality<=v_index+v_count;
   IF v_new IS DISTINCT FROM v_op->'removed' THEN RAISE EXCEPTION 'replay_v1:splice_precondition'; END IF;
   SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO v_new FROM jsonb_array_elements(v_old) WITH ORDINALITY WHERE ordinality<=v_index;
   v_new:=v_new||(v_op->'inserted');
   SELECT v_new||coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO v_new FROM jsonb_array_elements(v_old) WITH ORDINALITY WHERE ordinality>v_index+v_count;
   _state:=jsonb_set(_state,v_path,v_new);
  ELSE RAISE EXCEPTION 'replay_v1:unsupported_delta'; END IF;
 END LOOP;
 RETURN _state;
END;
$fn$;
CREATE FUNCTION private.replay_gin_project_cards_v1(_value jsonb,_catalog jsonb,_visibility jsonb,_viewer uuid,_path text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE v_result jsonb; v_key text; v_item jsonb; v_grant jsonb:='null'; v_allowed boolean; v_id text;
BEGIN
 IF jsonb_typeof(_value)='object' THEN
  IF _value ? 'rank' AND _value ? 'suit' THEN
   v_id:=_catalog->'cardIds'->>private.gin_card_key(_value);
   IF v_id IS NULL THEN RAISE EXCEPTION 'replay_v1:unknown_card'; END IF;
   IF _path[1]='discardPile' THEN v_grant:='"public"';
   ELSIF _path[1]='playerStates' THEN v_grant:=CASE WHEN _visibility->'hands'='"public"'::jsonb THEN '"public"'::jsonb ELSE _visibility->'hands'->_path[2] END;
   ELSIF _path[1]='lastAction' THEN v_grant:=_visibility->'lastAction'; END IF;
   v_allowed:=v_grant='"public"'::jsonb OR (_viewer IS NOT NULL AND v_grant=to_jsonb(_viewer::text));
   v_result:=jsonb_build_object('kind','card','objectId',v_id,'visibleTo',CASE WHEN v_grant IS NULL OR v_grant='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(v_grant) END);
   IF v_allowed THEN v_result:=v_result||jsonb_build_object('face',_value); END IF;
   RETURN v_result;
  END IF;
  v_result:='{}';
  FOR v_key,v_item IN SELECT key,value FROM jsonb_each(_value) LOOP
   v_result:=v_result||jsonb_build_object(v_key,private.replay_gin_project_cards_v1(v_item,_catalog,_visibility,_viewer,_path||v_key));
  END LOOP;
  RETURN v_result;
 ELSIF jsonb_typeof(_value)='array' THEN
  SELECT coalesce(jsonb_agg(private.replay_gin_project_cards_v1(value,_catalog,_visibility,_viewer,_path||(ordinality-1)::text) ORDER BY ordinality),'[]') INTO v_result
   FROM jsonb_array_elements(_value) WITH ORDINALITY;
  RETURN v_result;
 END IF;
 RETURN _value;
END;
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_project_checkpoint_v1(_state jsonb,_viewer uuid)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $fn$
DECLARE result jsonb;cards jsonb;entry jsonb;card jsonb;identity text;
BEGIN
 result:=(_state-'privateCatalog')||jsonb_build_object('gameState',private.replay_gin_project_cards_v1(
   _state->'gameState',_state->'privateCatalog',_state->'visibility',_viewer));
 IF jsonb_typeof(_state #> '{session,dealer_selection_state,cards}')='array' THEN
  cards:='[]';
  FOR entry IN SELECT value FROM jsonb_array_elements(_state #> '{session,dealer_selection_state,cards}') LOOP
   identity:=md5(concat_ws(':',_state #>> '{session,id}',_state #>> '{session,dealer_selection_state,preparedAt}',entry->>'roundNumber',entry->>'playerId'))::uuid::text;
   card:=jsonb_build_object('kind','card','objectId',identity,'visibleTo',CASE WHEN (entry->>'isRevealed')::boolean THEN '["public"]'::jsonb ELSE '[]'::jsonb END);
   IF (entry->>'isRevealed')::boolean THEN card:=card||jsonb_build_object('face',entry->'card'); END IF;
   cards:=cards||jsonb_build_array(jsonb_set(entry,'{card}',card));
  END LOOP;
  result:=jsonb_set(result,'{session,dealer_selection_state,cards}',cards);
 END IF;
 RETURN result;
END;
$fn$;
CREATE FUNCTION public.export_gin_replay_v1(_session_id uuid,_round_id uuid,_public_perspective boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $fn$
DECLARE v_row record; v_body jsonb; v_state jsonb; v_next jsonb; v_before_view jsonb; v_after_view jsonb; v_sub jsonb;
 v_substeps jsonb; v_steps jsonb:='[]'; v_actor uuid:=auth.uid(); v_viewer uuid; v_final text; v_complete text:='partial'; v_roster jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'replay_v1:authentication_required'; END IF;
 v_viewer:=CASE WHEN _public_perspective THEN NULL ELSE v_actor END;
 FOR v_row IN SELECT body FROM private.replay_steps WHERE session_id=_session_id
   AND body #>> '{identity,roundId}'=_round_id::text ORDER BY sequence LOOP
  v_body:=v_row.body;
  IF v_state IS NULL THEN
   v_state:=v_body #> '{opening,state}'; v_roster:=v_state->'roster';
   IF v_state IS NULL THEN RAISE EXCEPTION 'replay_v1:missing_opening'; END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_roster) p WHERE p->>'userId'=v_actor::text) THEN
    RAISE EXCEPTION 'replay_v1:not_historical_participant'; END IF;
   v_body:=jsonb_set(v_body,'{opening,state}',private.replay_gin_project_checkpoint_v1(v_state,v_viewer));
  END IF;
  v_substeps:='[]';
  FOR v_sub IN SELECT value FROM jsonb_array_elements(v_body->'substeps') LOOP
   v_next:=private.replay_apply_delta_v1(v_state,v_sub->'delta');
   v_before_view:=private.replay_gin_project_checkpoint_v1(v_state,v_viewer);
   v_after_view:=private.replay_gin_project_checkpoint_v1(v_next,v_viewer);
   v_sub:=v_sub||jsonb_build_object('delta',private.replay_diff_v1(v_before_view,v_after_view));
   IF v_sub #> '{operands,card}' IS DISTINCT FROM 'null'::jsonb AND v_sub #> '{operands,card}' IS NOT NULL THEN
    v_sub:=jsonb_set(v_sub,'{operands,card}',private.replay_gin_project_cards_v1(v_sub #> '{operands,card}',v_next->'privateCatalog',v_next->'visibility',v_viewer,ARRAY['lastAction','card']));
   END IF;
   v_substeps:=v_substeps||jsonb_build_array(v_sub); v_state:=v_next;
  END LOOP;
  v_body:=v_body||jsonb_build_object('substeps',v_substeps);
  IF v_body ? 'closing' THEN
   IF v_body #> '{closing,endingState}' IS DISTINCT FROM v_state THEN RAISE EXCEPTION 'replay_v1:ending_state_mismatch'; END IF;
   v_body:=jsonb_set(v_body,'{closing,endingState}',private.replay_gin_project_checkpoint_v1(v_state,v_viewer));
   v_complete:=v_body #>> '{closing,completeness}';
  ELSE v_complete:='partial'; END IF;
  v_final:=v_body->>'sequence'; v_steps:=v_steps||jsonb_build_array(v_body);
 END LOOP;
 IF v_state IS NULL THEN RAISE EXCEPTION 'replay_v1:no_recorded_hand'; END IF;
 RETURN jsonb_build_object('contract','ptown-replay/1','sessionId',_session_id,'coverage','hand_boundary',
  'perspective',CASE WHEN _public_perspective THEN jsonb_build_object('kind','public') ELSE jsonb_build_object('kind','participant','userId',v_actor) END,
  'steps',v_steps,'seal',jsonb_build_object('finalSequence',v_final,'stepCount',jsonb_array_length(v_steps),'completeness',v_complete));
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_apply_delta_v1(jsonb,jsonb),private.replay_gin_project_cards_v1(jsonb,jsonb,jsonb,uuid,text[]),
 private.replay_gin_project_checkpoint_v1(jsonb,uuid),public.export_gin_replay_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.export_gin_replay_v1(uuid,uuid,boolean) TO authenticated;
