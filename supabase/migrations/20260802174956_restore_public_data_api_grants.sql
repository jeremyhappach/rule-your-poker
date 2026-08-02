-- New Supabase projects no longer expose public tables to the Data API by
-- default. This project was migrated from an older project whose current
-- runtime depends on those table grants, with RLS remaining the row-level
-- authorization boundary.

DO $$
DECLARE
  unprotected_tables text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
    INTO unprotected_tables
  FROM pg_class AS c
  JOIN pg_namespace AS n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT c.relrowsecurity;

  IF unprotected_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'Refusing to expose public tables without RLS: %',
      unprotected_tables;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Preserve the source project's public-lobby boundary: anyone may list games,
-- but only authenticated users may create or mutate them.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.games FROM anon;

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Intentionally do not change default privileges. Every future public table
-- must declare its grants alongside RLS and policies in its own migration.
