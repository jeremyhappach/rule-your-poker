-- READ ONLY. Save this result as the release's rollback snapshot before applying.
-- No owner may silently differ from the reviewed source at the release window.
SELECT jsonb_build_object(
 'database',current_database(),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'md5',md5(pg_get_functiondef(p.oid)),'definition',pg_get_functiondef(p.oid)))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname IN('create_session_bot','eleven_up_configure','eleven_up_action','eleven_up_capabilities','submit_ante_decision','advance_ante_phase'))
   OR (n.nspname='private' AND p.proname IN('megatouch_begin','eleven_up_recover','eleven_up_settle','eleven_up_record_scores','eleven_up_board_reduce','eleven_up_reduce','eleven_up_admission_rules'))),
 'indexes',(SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i WHERE
  (schemaname='private' AND tablename IN('eleven_up_matches','eleven_up_requests')) OR
  (schemaname='public' AND tablename IN('game_results','session_player_snapshots'))),
 'admission',(SELECT to_jsonb(r) FROM private.eleven_up_release r WHERE singleton),
 'active_bot_matches',(SELECT count(*) FROM private.eleven_up_matches m WHERE NOT finished
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE coalesce((p->>'isBot')::boolean,false)))
) AS eleven_up_bot_release_preflight;
