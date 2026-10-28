-- Keep the existing minute job, incident gate and health record. One dispatcher.
CREATE TABLE private.delayed_recovery_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 token uuid,claimed boolean NOT NULL DEFAULT false,expires_at timestamptz,last_success timestamptz,failure text
);
INSERT INTO private.delayed_recovery_state DEFAULT VALUES;
ALTER TABLE private.delayed_recovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_recovery_state FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION private.delayed_words_recover() RENAME TO delayed_words_recover_local;
DO $$ DECLARE source_i text;old_i text;BEGIN
 source_i:=pg_get_functiondef('private.delayed_words_recover_local()'::regprocedure);
 old_i:='IF private.delayed_expire(c.id,c.segment,c.expires_at) THEN';
 IF position(old_i IN source_i)=0 THEN RAISE EXCEPTION 'delayed:recovery_source_changed';END IF;
 EXECUTE replace(source_i,old_i,'IF c.game_type=''ptown-words'' AND private.delayed_expire(c.id,c.segment,c.expires_at) THEN');
END $$;

CREATE FUNCTION private.delayed_words_recover() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.delayed_recovery_state;last_tick_i timestamptz;t uuid:=gen_random_uuid();n integer;
BEGIN
 PERFORM private.delayed_words_check_health();
 SELECT last_tick INTO last_tick_i FROM private.delayed_words_health WHERE singleton;
 n:=private.delayed_words_recover_local();
 SELECT * INTO STRICT s FROM private.delayed_recovery_state WHERE singleton FOR UPDATE;
 IF NOT s.enabled THEN RETURN n;END IF;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN
  UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;RETURN n;
 END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE m.status='active' AND NOT private.delayed_held(m.id) AND NOT c.terminal AND c.game_type<>'ptown-words'
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()) THEN RETURN n;END IF;
 UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;
 UPDATE private.delayed_recovery_state SET token=t,claimed=false,expires_at=clock_timestamp()+interval '25 seconds',
  failure=CASE WHEN s.token IS NOT NULL THEN 'delayed:lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/delayed-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-delayed-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_recover(),private.delayed_words_recover_local() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_recovery_claim(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.delayed_recovery_state;records jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM 1 FROM private.delayed_words_health WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT s FROM private.delayed_recovery_state WHERE singleton FOR UPDATE;
 IF p_token IS NULL OR s.token IS DISTINCT FROM p_token OR s.claimed OR s.expires_at<=clock_timestamp() OR NOT s.enabled
 THEN RAISE EXCEPTION 'delayed:recovery_denied';END IF;
 UPDATE private.delayed_recovery_state SET claimed=true WHERE singleton;
 SELECT coalesce(jsonb_agg(private.delayed_child_record(c::private.delayed_children)),'[]') INTO records FROM (
  SELECT c.* FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id) AND c.game_type<>'ptown-words'
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()
  ORDER BY least(c.expires_at,c.gameplay_due_at),c.id LIMIT 20) c;
 RETURN records;
END $$;
CREATE FUNCTION public.delayed_recovery_complete(p_token uuid,p_failure text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM 1 FROM private.delayed_words_health WHERE singleton FOR UPDATE;
 UPDATE private.delayed_recovery_state SET token=NULL,claimed=false,expires_at=NULL,failure=p_failure,
  last_success=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_success END
 WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:recovery_denied';END IF;
 IF p_failure IS NULL THEN UPDATE private.delayed_words_health SET last_tick=clock_timestamp() WHERE singleton;END IF;
END $$;
REVOKE ALL ON FUNCTION public.delayed_recovery_claim(uuid),public.delayed_recovery_complete(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_recovery_claim(uuid),public.delayed_recovery_complete(uuid,text) TO service_role;
