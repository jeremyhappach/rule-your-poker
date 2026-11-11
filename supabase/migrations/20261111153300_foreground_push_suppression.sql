SET LOCAL lock_timeout='3s';

-- Store the creation-time decision alongside the push event so a later claim
-- cannot resurrect a banner when the recipient backgrounds their last tab.
ALTER TABLE private.push_events ADD COLUMN foreground_suppressed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.push_user_active(who uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
  SELECT FROM public.voice_presence_heartbeats
  WHERE user_id=who AND status='active'
   AND updated_at>clock_timestamp()-interval '10 seconds'
 )
$$;

CREATE FUNCTION private.mark_push_foreground() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 NEW.foreground_suppressed:=private.push_user_active(NEW.user_id);
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.mark_push_foreground() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mark_push_foreground BEFORE INSERT ON private.push_events
 FOR EACH ROW EXECUTE FUNCTION private.mark_push_foreground();

DO $patch$
DECLARE
 target regprocedure;
 source text;
 old_guard constant text := 'e.kind=''table_open'' AND private.push_user_active(e.user_id)';
 new_guard constant text := 'e.foreground_suppressed OR private.push_user_active(e.user_id)';
BEGIN
 FOREACH target IN ARRAY ARRAY['public.async_push_claim()'::regprocedure,
  'public.async_push_authorize(uuid,uuid,uuid)'::regprocedure] LOOP
  source:=pg_get_functiondef(target);
  IF (length(source)-length(replace(source,old_guard,'')))<>length(old_guard) THEN
   RAISE EXCEPTION 'foreground push: dispatch owner changed (%)',target;
  END IF;
  EXECUTE replace(source,old_guard,new_guard);
 END LOOP;
END
$patch$;
