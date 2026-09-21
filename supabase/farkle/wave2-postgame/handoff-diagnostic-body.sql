-- Diagnostic only, not a migration. Caller wraps candidate + fixture helpers +
-- this file in BEGIN/ROLLBACK. No production state persists.
CREATE TEMP TABLE farkle_handoff_diagnostic(mode text, facts jsonb);
DO $p$
DECLARE mode text; f jsonb; g uuid; d uuid; r uuid; deadline timestamptz;
 timeout_answer jsonb; timeout_error text; generic_error text; generic_wrote boolean;
 before_chips integer; original_game jsonb; after_game jsonb; duplicate jsonb;
BEGIN
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',false) WHERE key='make_it_take_it';
 FOREACH mode IN ARRAY ARRAY['retained_farkle','neutral_setup'] LOOP
  f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
  PERFORM pg_temp.farkle_postgame_bank(f);
  PERFORM public.farkle_advance_postgame(g,r,d,1);
  PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup');
  -- Simulates only the isolated owner's proposed neutral setup assignment.
  -- No guard or deployed shared function is changed by this diagnostic.
  IF mode='neutral_setup' THEN UPDATE public.games SET game_type=NULL WHERE id=g; END IF;
  deadline:=clock_timestamp()-interval '1 second';
  UPDATE public.games SET config_deadline=deadline WHERE id=g;
  PERFORM set_config('app.farkle_authority','',true);
  PERFORM pg_temp.farkle_identity((f->>'peer')::uuid);
  SELECT chips INTO before_chips FROM public.players WHERE id=(f->>'b')::uuid;
  generic_wrote:=false; generic_error:=NULL;
  BEGIN
   PERFORM public.increment_player_chips((f->>'b')::uuid,1);
   SELECT chips<>before_chips INTO generic_wrote FROM public.players WHERE id=(f->>'b')::uuid;
   RAISE EXCEPTION 'diagnostic:undo_generic_probe';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'diagnostic:undo_generic_probe' THEN generic_error:=SQLSTATE||':'||SQLERRM; END IF;
  END;
  SELECT to_jsonb(x) INTO original_game FROM public.games x WHERE id=g;
  timeout_answer:=NULL; timeout_error:=NULL;
  BEGIN
   timeout_answer:=private.handle_config_deadline_timeout_exact(g,deadline,3);
  EXCEPTION WHEN OTHERS THEN timeout_error:=SQLSTATE||':'||SQLERRM;
  END;
  SELECT to_jsonb(x) INTO after_game FROM public.games x WHERE id=g;
  duplicate:=public.farkle_advance_postgame(g,r,d,1);
  INSERT INTO farkle_handoff_diagnostic VALUES(mode,jsonb_build_object(
   'generic_rpc_authenticated_execute',has_function_privilege('authenticated','public.increment_player_chips(uuid,integer)','EXECUTE'),
   'generic_chip_write_succeeded',generic_wrote,'generic_error',generic_error,
   'timeout_result',timeout_answer,'timeout_error',timeout_error,
   'resulting_status',after_game->'status','resulting_game_type',after_game->'game_type',
   'failed_timeout_unchanged',CASE WHEN timeout_error IS NOT NULL THEN after_game=original_game ELSE NULL END,
   'continuation_duplicate',duplicate->>'outcome',
   'duplicate_unchanged',(SELECT to_jsonb(x)=after_game FROM public.games x WHERE id=g),
   'authority_claim_restored',coalesce(current_setting('app.farkle_authority',true),'')=''));
  PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup'); DELETE FROM public.games WHERE id=g;
  PERFORM set_config('app.farkle_authority','',true);
 END LOOP;
END $p$;
SELECT jsonb_build_object('diagnostic',jsonb_object_agg(mode,facts),
 'release',(SELECT to_jsonb(r) FROM private.farkle_release r),
 'fixture_count',(SELECT count(*) FROM public.games WHERE name='TEST ONLY: Wave2 postgame rollback')) AS evidence
FROM farkle_handoff_diagnostic;
