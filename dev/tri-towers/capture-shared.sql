-- Read-only trigger dependency closure and table metadata for isolated qualification.
WITH RECURSIVE f AS (
 SELECT p.oid,n.nspname,p.proname,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')
), needed(oid) AS (
 SELECT DISTINCT t.tgfoid FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN ('games','players','rounds','dealer_games','game_results','session_player_snapshots','game_defaults','gameplay_transfer_pending_changes','gameplay_transfer_batches')
 UNION
 SELECT called.oid FROM needed n JOIN f caller ON caller.oid=n.oid JOIN f called ON caller.prosrc ~ ('\m'||called.proname||'\M[[:space:]]*\(')
)
SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('name',f.nspname||'.'||f.proname,'definition',pg_get_functiondef(f.oid))) FROM f JOIN needed USING(oid)),
'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
'constraints',(SELECT jsonb_agg(pg_get_constraintdef(co.oid)) FROM pg_constraint co WHERE co.conrelid=c.oid AND co.contype IN ('p','u','c')),
'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid AND NOT EXISTS(SELECT 1 FROM pg_constraint co WHERE co.conindid=i.indexrelid AND co.contype IN ('p','u','x')))))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind='r'),
'enums',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'values',(SELECT jsonb_agg(e.enumlabel ORDER BY enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private') AND t.typtype='e')) evidence;
