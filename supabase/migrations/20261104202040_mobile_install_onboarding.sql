-- Account-owned tutorial decisions only. No notification, gameplay or financial writes.
CREATE TABLE IF NOT EXISTS private.mobile_onboarding (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK (version = 1),
 completed_at timestamptz, dismissed_at timestamptz, snoozed_until timestamptz,
 last_presented_at timestamptz, last_request_id uuid,
 PRIMARY KEY (user_id, version)
);
ALTER TABLE private.mobile_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mobile_onboarding FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.mobile_onboarding_preference(
 p_action text, p_version integer, p_request_id uuid, p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE who uuid := auth.uid(); p private.mobile_onboarding; at_time timestamptz := clock_timestamp();
 eligible boolean;
BEGIN
 IF who IS NULL OR NOT private.account_enabled(who) OR (p_user_id IS NOT NULL AND p_user_id<>who) THEN
  RAISE EXCEPTION 'onboarding:not_authorized' USING ERRCODE = '42501';
 END IF;
 IF p_version IS DISTINCT FROM 1 OR p_action IS NULL OR p_action NOT IN ('read','present','snooze','dismiss','complete') THEN
  RAISE EXCEPTION 'onboarding:invalid_request' USING ERRCODE = '22023';
 END IF;
 IF p_action <> 'read' THEN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'onboarding:request_id_required' USING ERRCODE = '22023'; END IF;
  INSERT INTO private.mobile_onboarding(user_id,version) VALUES(who,p_version) ON CONFLICT (user_id,version) DO NOTHING;
 END IF;
 SELECT * INTO p FROM private.mobile_onboarding WHERE user_id=who AND version=p_version FOR UPDATE;
 eligible := p.completed_at IS NULL AND p.dismissed_at IS NULL AND (p.snoozed_until IS NULL OR p.snoozed_until <= at_time);
 IF p_action <> 'read' AND p.last_request_id IS DISTINCT FROM p_request_id THEN
  UPDATE private.mobile_onboarding SET
   completed_at = CASE WHEN p_action='complete' THEN coalesce(completed_at,at_time) ELSE completed_at END,
   dismissed_at = CASE WHEN p_action='dismiss' THEN coalesce(dismissed_at,at_time) ELSE dismissed_at END,
   snoozed_until = CASE WHEN p_action='snooze' AND eligible THEN at_time + interval '7 days' ELSE snoozed_until END,
   last_presented_at = CASE WHEN p_action='present' AND eligible THEN at_time ELSE last_presented_at END,
   last_request_id = p_request_id
  WHERE user_id=who AND version=p_version RETURNING * INTO p;
 END IF;
 RETURN jsonb_build_object('userId',who,'version',p_version,'completed',p.completed_at IS NOT NULL,
  'dismissed',p.dismissed_at IS NOT NULL,'snoozedUntil',p.snoozed_until,'lastPresentedAt',p.last_presented_at,
  'eligible',p.completed_at IS NULL AND p.dismissed_at IS NULL AND (p.snoozed_until IS NULL OR p.snoozed_until <= at_time));
END $$;
REVOKE ALL ON FUNCTION private.mobile_onboarding_preference(text,integer,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.mobile_onboarding_preference(text,integer,uuid,uuid) TO authenticated;

-- Parsed SQL body binds the private function without granting private-schema USAGE.
CREATE OR REPLACE FUNCTION public.mobile_onboarding_preference(
 p_action text DEFAULT 'read', p_version integer DEFAULT 1, p_request_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
BEGIN ATOMIC
 SELECT private.mobile_onboarding_preference(p_action,p_version,p_request_id,p_user_id);
END;
REVOKE ALL ON FUNCTION public.mobile_onboarding_preference(text,integer,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_onboarding_preference(text,integer,uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
