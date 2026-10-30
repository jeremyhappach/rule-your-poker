-- LOCAL REVIEW CANDIDATE ONLY. No hosted installation or publication authorized.
-- Private Realtime channel authorization is a new scoped permission dependency.
CREATE OR REPLACE FUNCTION private.delayed_presence_allowed(topic_i text,publishing boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE topic_i='delayed-playing:'||m.id::text||':'||c.id::text||':'||c.actor::text||':'||floor(extract(epoch FROM c.expires_at)*1000)::bigint::text
   AND auth.uid() IN(m.organizer,m.opponent) AND (NOT publishing OR auth.uid()=c.actor)
   AND m.status='active' AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id) AND NOT c.terminal
   AND c.available_at<=statement_timestamp() AND c.expires_at>statement_timestamp()
   AND NOT private.delayed_held(m.id)
 );
$$;
REVOKE ALL ON FUNCTION private.delayed_presence_allowed(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.delayed_presence_allowed(text,boolean) TO authenticated;
DROP POLICY IF EXISTS delayed_playing_read ON realtime.messages;
CREATE POLICY delayed_playing_read ON realtime.messages FOR SELECT TO authenticated
 USING(extension='presence' AND private.delayed_presence_allowed((SELECT realtime.topic()),false));
DROP POLICY IF EXISTS delayed_playing_write ON realtime.messages;
CREATE POLICY delayed_playing_write ON realtime.messages FOR INSERT TO authenticated
 WITH CHECK(extension='presence' AND private.delayed_presence_allowed((SELECT realtime.topic()),true));
