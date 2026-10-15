-- Read-only metadata export; save the result object as
-- qualification.local/tri-towers/schema-source.json. No application rows.
SELECT version(),
 (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(pg_get_constraintdef(co.oid)) FROM pg_constraint co WHERE co.conrelid=c.oid AND co.contype IN ('p','u','c')),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid AND NOT EXISTS(SELECT 1 FROM pg_constraint co WHERE co.conindid=i.indexrelid))))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN ('games','players','profiles','dealer_games','rounds','game_results','session_player_snapshots','gameplay_transfer_pending_changes','gameplay_transfer_batches'))
 OR (n.nspname='private' AND c.relname IN ('dealer_game_setup_commits','session_abandonment_watches','postgame_forced_absence_watches'))) tables,
 (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'values',(SELECT jsonb_agg(e.enumlabel ORDER BY enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e') enums;
