-- Read-only evidence. Run again against the serialized release baseline.
SELECT jsonb_build_object(
 'database',current_database(),
 'ante_md5',md5(replace(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure),chr(13),'')),
 'canasta_release',to_regclass('private.canasta_release'),
 'canasta_revisions',to_regclass('public.canasta_revisions'),
 'extensions',(SELECT jsonb_object_agg(extname,extversion) FROM pg_extension WHERE extname IN ('pg_cron','pg_net')),
 'scheduler',(SELECT coalesce(jsonb_agg(to_jsonb(j)),'[]') FROM cron.job j WHERE jobname='canasta-recovery'),
 'authority',(SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(replace(pg_get_functiondef(p.oid),chr(13),'')))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')
  AND p.proname IN ('submit_ante_decision','settle_gameplay_chip_transfers','set_game_paused','set_automatic_play','advance_ante_phase_exact')),
 'indexes',(SELECT jsonb_agg(indexdef ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname IN ('private','public')
  AND tablename IN ('dealer_game_setup_commits','gameplay_transfer_batches','game_results','session_player_snapshots','game_defaults'))
);
