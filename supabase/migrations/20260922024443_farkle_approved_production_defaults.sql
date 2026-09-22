-- Additive Farkle-only serialization correction; no guard or timing changes.
DO $guard$ BEGIN
  IF md5(pg_get_functiondef('private.farkle_resolve_config_v1(public.games,jsonb)'::regprocedure)) <> 'ef2e2556cb464f0715557a90e4751677'
  THEN RAISE EXCEPTION 'farkle_defaults:resolver_drift'; END IF;
END $guard$;
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
   'turnSeconds',defaults.decision_timer_seconds,'botDelayMs',trim_scale(defaults.bot_decision_delay_seconds*1000));
 END IF;
 PERFORM private.farkle_validate_rules_v1(rules);
 IF c->>'botPolicy' IS DISTINCT FROM 'balanced' THEN RAISE EXCEPTION 'farkle:unsupported_bot_policy'; END IF;
 RETURN c||jsonb_build_object('version',1,'rules',rules,'ante_amount',(input->>'ante_amount')::integer,
  'targetScore',(input->>'targetScore')::bigint,'endgame',input->>'endgame');
END $function$
;

-- Jeremy explicitly approved these production values on September 21, 2026.
-- Defaults seed: grants, frozen games and global timing are unchanged.
DO $seed$
DECLARE expected jsonb := '{"scoring":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[1000,1000,1000,1000,1000,1000],"5":[2000,2000,2000,2000,2000,2000],"6":[3000,3000,3000,3000,3000,3000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500},"endgame":"equal_turns","botPolicy":"balanced","botBankThreshold":500}'::jsonb; actual public.game_defaults;
BEGIN
  -- Serialize with creation/recovery through the established Farkle lock.
  PERFORM pg_advisory_xact_lock(19092026,1);
  IF NOT EXISTS (SELECT 1 FROM private.farkle_release WHERE singleton AND admin_only)
  THEN RAISE EXCEPTION 'farkle_seed:admin_gate_required'; END IF;
  PERFORM private.farkle_validate_rules_v1(expected->'scoring');
  -- Omit stake and timing columns to inherit the existing platform schema defaults.
  INSERT INTO public.game_defaults(game_type,points_to_win,farkle_rules)
  VALUES('farkle',10000,expected) ON CONFLICT(game_type) DO NOTHING;
  SELECT * INTO STRICT actual FROM public.game_defaults WHERE game_type='farkle';
  IF actual.points_to_win<>10000 OR actual.farkle_rules IS DISTINCT FROM expected
    OR actual.decision_timer_seconds<>10 OR actual.bot_decision_delay_seconds<>2
  THEN RAISE EXCEPTION 'farkle_seed:existing_defaults_drift'; END IF;
  IF private.farkle_score_v1(ARRAY[1,1,1,1],actual.farkle_rules->'scoring')<>1100
  THEN RAISE EXCEPTION 'farkle_seed:scoring_contract_drift'; END IF;
  UPDATE private.farkle_release SET production_defaults_approved=true WHERE singleton;
  UPDATE private.farkle_release SET creation_enabled=true WHERE singleton AND admin_only AND production_defaults_approved;
END $seed$;
