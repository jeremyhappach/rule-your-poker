-- Read-only schema export for the disposable replay qualification database.
-- No historical sessions, credentials, cron jobs, or production rows are copied.
-- The migration chain contains production-specific cron IDs, so qualification
-- restores the current definitions rather than replaying historical operations.
WITH schemas AS (
  SELECT oid,nspname FROM pg_namespace WHERE nspname IN ('public','private')
), relations AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN schemas n ON n.oid=c.relnamespace
  WHERE c.relkind='r'
), functions AS (
  SELECT p.*,n.nspname FROM pg_proc p JOIN schemas n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
    AND d.objid=p.oid AND d.deptype='e'
  )
), parts AS (
  SELECT 10 AS phase, 'types' AS name, string_agg(format('CREATE TYPE %I.%I AS ENUM (%s);',n.nspname,t.typname,
    (SELECT string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)),E'\n' ORDER BY t.typname) AS sql
    FROM pg_type t JOIN schemas n ON n.oid=t.typnamespace WHERE t.typtype='e'
  UNION ALL
  SELECT 20,'sequences',string_agg(format('CREATE SEQUENCE %I.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s %s;',
    n.nspname,c.relname,format_type(s.seqtypid,NULL),s.seqincrement,s.seqmin,s.seqmax,s.seqstart,s.seqcache,CASE WHEN s.seqcycle THEN 'CYCLE' ELSE 'NO CYCLE' END),E'\n' ORDER BY c.relname)
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN schemas n ON n.oid=c.relnamespace
    WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='i')
  UNION ALL
  SELECT 30,'tables',string_agg(format('CREATE TABLE %I.%I (%s);',r.nspname,r.relname,
    (SELECT string_agg(format('%I %s%s%s',a.attname,format_type(a.atttypid,a.atttypmod),
      CASE WHEN a.attidentity='' THEN '' ELSE ' GENERATED '||CASE WHEN a.attidentity='a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END||' AS IDENTITY' END,
      CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END),',' ORDER BY a.attnum)
     FROM pg_attribute a WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped)),E'\n' ORDER BY r.nspname,r.relname)
    FROM relations r
  UNION ALL
  SELECT 40,'functions',string_agg(pg_get_functiondef(p.oid)||format(E';\nALTER FUNCTION %I.%I(%s) OWNER TO %I;',p.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner)),E'\n' ORDER BY p.nspname,p.proname,p.oid)
    FROM functions p
  UNION ALL
  SELECT 50,'defaults',string_agg(format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s;',r.nspname,r.relname,a.attname,pg_get_expr(d.adbin,d.adrelid)),E'\n' ORDER BY r.relname,a.attnum)
    FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid JOIN pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum
  UNION ALL
  SELECT 60,'constraints',string_agg(format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;',r.nspname,r.relname,c.conname,pg_get_constraintdef(c.oid)),E'\n' ORDER BY (c.contype='f'),r.relname,c.conname)
    FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid WHERE c.contype NOT IN ('t','f')
  UNION ALL
  SELECT 75,'foreign_keys',string_agg(format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;',r.nspname,r.relname,c.conname,pg_get_constraintdef(c.oid)),E'\n' ORDER BY r.relname,c.conname)
    FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid WHERE c.contype='f'
  UNION ALL
  SELECT 70,'indexes',string_agg(pg_get_indexdef(i.indexrelid)||';',E'\n' ORDER BY r.relname,i.indexrelid)
    FROM relations r JOIN pg_index i ON i.indrelid=r.oid WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=i.indexrelid AND c.contype IN ('p','u','x'))
  UNION ALL
  SELECT 80,'triggers',string_agg(pg_get_triggerdef(t.oid)||';',E'\n' ORDER BY t.tgrelid,t.tgname)
    FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgfoid IN (SELECT oid FROM functions)
  UNION ALL
  SELECT 90,'rls',string_agg(format('ALTER TABLE %I.%I %s ROW LEVEL SECURITY;',r.nspname,r.relname,CASE WHEN r.relrowsecurity THEN 'ENABLE' ELSE 'DISABLE' END),E'\n' ORDER BY r.relname)
    FROM relations r
  UNION ALL
  SELECT 100,'policies',string_agg(format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',p.policyname,p.schemaname,p.tablename,p.permissive,p.cmd,
    array_to_string(ARRAY(SELECT CASE WHEN role='public' THEN 'PUBLIC' ELSE quote_ident(role) END FROM unnest(p.roles) role),','),
    CASE WHEN p.qual IS NULL THEN '' ELSE ' USING ('||p.qual||')' END,CASE WHEN p.with_check IS NULL THEN '' ELSE ' WITH CHECK ('||p.with_check||')' END),E'\n' ORDER BY p.tablename,p.policyname)
    FROM pg_policies p WHERE p.schemaname IN ('public','private')
  UNION ALL
  SELECT 110,'table_grants',string_agg(format('GRANT %s ON TABLE %I.%I TO %s;',a.privilege_type,r.nspname,r.relname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END),E'\n' ORDER BY r.relname,a.grantee,a.privilege_type)
    FROM relations r CROSS JOIN LATERAL aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a
  UNION ALL
  SELECT 120,'column_grants',string_agg(format('GRANT %s (%I) ON TABLE %I.%I TO %s;',x.privilege_type,a.attname,r.nspname,r.relname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END),E'\n' ORDER BY r.relname,a.attnum)
    FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT 130,'function_grants',E'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,private FROM PUBLIC,anon,authenticated,service_role;\n'||string_agg(format('GRANT %s ON FUNCTION %I.%I(%s) TO %s;',a.privilege_type,p.nspname,p.proname,pg_get_function_identity_arguments(p.oid),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END),E'\n' ORDER BY p.proname,a.grantee)
    FROM functions p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
) SELECT phase,name,sql FROM parts WHERE sql IS NOT NULL ORDER BY phase;
