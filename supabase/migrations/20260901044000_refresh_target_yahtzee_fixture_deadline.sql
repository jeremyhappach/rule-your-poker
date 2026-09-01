-- Deterministic Yahtzee preparation may include a full hydration/rejoin before
-- the browser scores. Give that exact fake-money test turn a fresh canonical
-- deadline so the ordinary timeout owner cannot take over mid-fixture.

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.prepare_yahtzee_rule_branch_turn(uuid)'::regprocedure)
    INTO v_definition;

  v_old:=E'  v_dice jsonb; v_sequence integer;\n';
  v_new:=E'  v_dice jsonb; v_sequence integer; v_deadline timestamptz;\n';
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'refresh_target_yahtzee_fixture_deadline:declaration_shape_mismatch';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old:=E'  v_sequence:=coalesce((v_state->>\'actionSequence\')::integer,0)+1;\n';
  v_new:=E'  v_sequence:=coalesce((v_state->>\'actionSequence\')::integer,0)+1;\n  v_deadline:=private.yahtzee_turn_deadline(v_game.id,v_player_id);\n';
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'refresh_target_yahtzee_fixture_deadline:sequence_shape_mismatch';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old:=E'  v_state:=jsonb_set(v_state,\'{actionSequence}\',to_jsonb(v_sequence),true);\n  PERFORM set_config(\'app.yahtzee_authoritative_write\',\'on\',true);\n  UPDATE public.rounds SET yahtzee_state=v_state WHERE id=v_round.id;';
  v_new:=E'  v_state:=jsonb_set(v_state,\'{actionSequence}\',to_jsonb(v_sequence),true);\n  v_state:=jsonb_set(v_state,\'{turnDeadline}\',to_jsonb(v_deadline),true);\n  PERFORM set_config(\'app.yahtzee_authoritative_write\',\'on\',true);\n  UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline WHERE id=v_round.id;';
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'refresh_target_yahtzee_fixture_deadline:update_shape_mismatch';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$migration$;
