-- Called only by the canonical dealer-game configuration owner.
CREATE OR REPLACE FUNCTION private.farkle_resolve_config_v1(g public.games,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE release private.farkle_release; defaults public.game_defaults; old public.dealer_games; c jsonb; rules jsonb; test_config jsonb;
BEGIN
 -- Shared with recovery; retained through dealer-game insertion and COMMIT.
 PERFORM pg_advisory_xact_lock_shared(19092026,1);
 SELECT * INTO release FROM private.farkle_release WHERE singleton;
 IF NOT coalesce(release.creation_enabled,false) THEN RAISE EXCEPTION 'farkle:creation_disabled'; END IF;
 IF NOT FOUND OR (release.admin_only AND coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role)))
 THEN RAISE EXCEPTION 'farkle:admin_only' USING ERRCODE='42501'; END IF;
 IF (input-ARRAY['ante_amount','targetScore','endgame','runBackDealerGameId','testConfiguration'])<>'{}'::jsonb THEN RAISE EXCEPTION 'farkle:unsupported_setup_field'; END IF;
 IF input ? 'runBackDealerGameId' THEN
  SELECT * INTO old FROM public.dealer_games WHERE id=(input->>'runBackDealerGameId')::uuid AND session_id=g.id AND game_type='farkle';
  IF NOT FOUND OR input ? 'testConfiguration' OR (input->>'ante_amount')::integer IS DISTINCT FROM (old.config->>'ante_amount')::integer
  OR (input ? 'targetScore' AND input->'targetScore' IS DISTINCT FROM old.config->'targetScore')
  OR (input ? 'endgame' AND input->'endgame' IS DISTINCT FROM old.config->'endgame') THEN RAISE EXCEPTION 'farkle:run_back_snapshot_mismatch'; END IF;
  IF g.real_money AND coalesce((old.config->>'testOnly')::boolean,false) THEN RAISE EXCEPTION 'farkle:test_rules_fake_money_only'; END IF;
  IF coalesce((old.config->>'testOnly')::boolean,false) AND coalesce(auth.jwt()->>'role','')<>'service_role'
   AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role)) THEN RAISE EXCEPTION 'farkle:test_config_admin_only' USING ERRCODE='42501'; END IF;
  IF NOT coalesce((old.config->>'testOnly')::boolean,false) AND NOT release.production_defaults_approved THEN RAISE EXCEPTION 'farkle:production_defaults_unapproved'; END IF;
  RETURN old.config;
 END IF;
 test_config:=input->'testConfiguration';
 IF test_config IS NOT NULL THEN
  IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role))
  THEN RAISE EXCEPTION 'farkle:test_config_admin_only' USING ERRCODE='42501'; END IF;
  IF g.real_money OR coalesce(test_config->>'label','') NOT LIKE 'TEST ONLY:%' OR coalesce((test_config->>'testOnly')::boolean,false) IS NOT TRUE
  THEN RAISE EXCEPTION 'farkle:test_rules_fake_money_only'; END IF;
  rules:=test_config->'rules';
  c:=jsonb_build_object('testOnly',true,'testLabel',test_config->'label','botPolicy',test_config->'botPolicy',
   'botBankThreshold',test_config->'botBankThreshold','turnSeconds',test_config->'turnSeconds','botDelayMs',test_config->'botDelayMs');
 ELSE
  IF NOT release.production_defaults_approved THEN RAISE EXCEPTION 'farkle:production_defaults_unapproved'; END IF;
  SELECT * INTO defaults FROM public.game_defaults WHERE game_type='farkle';
  IF NOT FOUND OR defaults.farkle_rules IS NULL THEN RAISE EXCEPTION 'farkle:missing_admin_defaults'; END IF;
  rules:=defaults.farkle_rules->'scoring';
  c:=jsonb_build_object('testOnly',false,'botPolicy',defaults.farkle_rules->'botPolicy','botBankThreshold',defaults.farkle_rules->'botBankThreshold',
   'turnSeconds',defaults.decision_timer_seconds,'botDelayMs',defaults.bot_decision_delay_seconds*1000);
 END IF;
 PERFORM private.farkle_validate_rules_v1(rules);
 IF c->>'botPolicy' IS DISTINCT FROM 'balanced' THEN RAISE EXCEPTION 'farkle:unsupported_bot_policy'; END IF;
 RETURN c||jsonb_build_object('version',1,'rules',rules,'ante_amount',(input->>'ante_amount')::integer,
  'targetScore',(input->>'targetScore')::bigint,'endgame',input->>'endgame');
END $f$;
REVOKE ALL ON FUNCTION private.farkle_resolve_config_v1(public.games,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_guard_shared_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE is_farkle boolean; row_new jsonb; row_old jsonb;
BEGIN
 row_new:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 row_old:=CASE WHEN TG_OP='INSERT' THEN row_new ELSE to_jsonb(OLD) END;
 IF TG_TABLE_NAME='games' THEN
  is_farkle:=row_new->>'game_type'='farkle' OR row_old->>'game_type'='farkle';
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND id IN ((row_new->>'game_id')::uuid,(row_old->>'game_id')::uuid)) INTO is_farkle;
 END IF;
 IF is_farkle THEN
  IF TG_TABLE_NAME='games' THEN
   PERFORM private.farkle_require_claim_v1((row_new->>'id')::uuid);
   PERFORM private.farkle_require_claim_v1((row_old->>'id')::uuid);
  ELSE
   PERFORM private.farkle_require_claim_v1((row_new->>'game_id')::uuid);
   PERFORM private.farkle_require_claim_v1((row_old->>'game_id')::uuid);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_guard_shared_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS farkle_guard_game ON public.games;
CREATE TRIGGER farkle_guard_game BEFORE INSERT OR UPDATE OR DELETE ON public.games FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_shared_v1();
DROP TRIGGER IF EXISTS farkle_guard_player ON public.players;
CREATE TRIGGER farkle_guard_player BEFORE UPDATE OF chips,auto_fold,auto_play_stop_round_id,game_id,id,user_id,is_bot ON public.players FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_shared_v1();
DROP TRIGGER IF EXISTS farkle_guard_player_roster ON public.players;
CREATE TRIGGER farkle_guard_player_roster BEFORE INSERT OR DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_shared_v1();

CREATE OR REPLACE FUNCTION private.farkle_guard_ledger_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE candidate jsonb; old_row jsonb; v_game uuid; v_dealer uuid;
BEGIN
 candidate:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_row:=CASE WHEN TG_OP='INSERT' THEN candidate ELSE to_jsonb(OLD) END;
 FOR candidate IN SELECT value FROM jsonb_array_elements(jsonb_build_array(candidate,old_row)) LOOP
  v_game:=(candidate->>'game_id')::uuid; v_dealer:=(candidate->>'dealer_game_id')::uuid;
  IF candidate->>'game_type'='farkle' OR EXISTS(SELECT 1 FROM public.dealer_games WHERE id=v_dealer AND game_type='farkle')
  OR EXISTS(SELECT 1 FROM public.games WHERE id=v_game AND game_type='farkle') THEN
   PERFORM private.farkle_require_claim_v1(v_game,v_dealer);
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_guard_ledger_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS farkle_guard_result ON public.game_results;
CREATE TRIGGER farkle_guard_result BEFORE INSERT OR UPDATE OR DELETE ON public.game_results FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_ledger_v1();
DROP TRIGGER IF EXISTS farkle_guard_snapshot ON public.session_player_snapshots;
CREATE TRIGGER farkle_guard_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_ledger_v1();
