-- Jeremy explicitly approved grandfathering all current users on 2026-11-04.
-- Freeze the cohort at the read-only inventory; never auto-verify future signups.
ALTER TABLE private.email_ownership DROP CONSTRAINT IF EXISTS email_ownership_method_check;
ALTER TABLE private.email_ownership ADD CONSTRAINT email_ownership_method_check
 CHECK (method IN ('supabase_email_token', 'owner_grandfathered'));

-- A genuine later token must accurately replace the grandfathering provenance.
CREATE OR REPLACE FUNCTION public.account_email_verified(p_user uuid,p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_user AND email=p_email FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account:email_changed'; END IF;
 INSERT INTO private.email_ownership(user_id,email) VALUES(p_user,p_email)
 ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,
  verified_at=clock_timestamp(),method=excluded.method;
 UPDATE public.account_access SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_user;
END $$;

-- Retain genuine verification evidence, access decisions and Auth timestamps.
-- Share locks serialize this one-time grant against concurrent email changes.
WITH existing_users AS MATERIALIZED (
 SELECT id,email FROM auth.users
 WHERE created_at <= timestamptz '2026-11-04 17:03:38.712215+00'
  AND deleted_at IS NULL AND nullif(email,'') IS NOT NULL
 ORDER BY id FOR SHARE
), newly_verified AS (
 INSERT INTO private.email_ownership(user_id,email,method)
 SELECT id,email,'owner_grandfathered' FROM existing_users
 ON CONFLICT(user_id) DO NOTHING
 RETURNING user_id
)
UPDATE public.account_access a
 SET revision=a.revision+1,updated_at=clock_timestamp()
 FROM newly_verified v WHERE a.user_id=v.user_id;
