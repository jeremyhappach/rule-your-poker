-- Disable new creation under the existing lock; retain approved defaults/history.
BEGIN;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
CREATE OR REPLACE FUNCTION private.farkle_resolve_config_v1(g games, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
DO $verify$ BEGIN
  IF md5(pg_get_functiondef('private.farkle_resolve_config_v1(public.games,jsonb)'::regprocedure)) <> 'ef2e2556cb464f0715557a90e4751677'
  THEN RAISE EXCEPTION 'farkle_defaults:restore_mismatch'; END IF;
END $verify$;
COMMIT;
