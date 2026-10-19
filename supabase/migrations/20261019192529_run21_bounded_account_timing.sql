-- Temporary, account-authorized Run21 timing evidence; independent of gameplay.
CREATE TABLE private.run21_timing_grants (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 armed_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 retain_until timestamptz NOT NULL,
 CHECK (expires_at > armed_at AND expires_at <= armed_at + interval '7 days'),
 CHECK (retain_until = expires_at + interval '7 days')
);
CREATE TABLE private.run21_timing_captures (
 user_id uuid NOT NULL REFERENCES private.run21_timing_grants(user_id) ON DELETE CASCADE,
 capture_id uuid NOT NULL,
 mode text NOT NULL CHECK (mode IN ('arcade','multiplayer')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 samples jsonb NOT NULL CHECK (jsonb_typeof(samples)='array' AND jsonb_array_length(samples)<=2400 AND octet_length(samples::text)<=524288),
 PRIMARY KEY(user_id,capture_id)
);
ALTER TABLE private.run21_timing_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.run21_timing_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_timing_grants,private.run21_timing_captures FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.run21_timing_grant() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('serverNow',extract(epoch FROM clock_timestamp())*1000,
 'expiresAt',extract(epoch FROM g.expires_at)*1000)
 FROM private.run21_timing_grants g WHERE g.user_id=auth.uid()
 AND clock_timestamp()>=g.armed_at AND clock_timestamp()<g.expires_at
$$;
REVOKE ALL ON FUNCTION public.run21_timing_grant() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.run21_timing_grant() TO authenticated;

CREATE FUNCTION public.run21_store_timing(p_capture_id uuid,p_mode text,p_samples jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g private.run21_timing_grants; s jsonb; k text; v jsonb;
BEGIN
 SELECT * INTO g FROM private.run21_timing_grants WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR clock_timestamp()<g.armed_at OR clock_timestamp()>=g.expires_at THEN RETURN false; END IF;
 IF p_capture_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('arcade','multiplayer') OR p_samples IS NULL
 OR jsonb_typeof(p_samples)<>'array' OR jsonb_array_length(p_samples)>2400
 OR octet_length(p_samples::text)>524288 THEN RAISE EXCEPTION 'invalid_timing'; END IF;
 -- Only numeric metadata, fixed stage labels and opaque correlation hashes.
 FOR s IN SELECT value FROM jsonb_array_elements(p_samples) LOOP
  IF jsonb_typeof(s)<>'array' OR jsonb_array_length(s)<>7
   OR jsonb_typeof(s->0)<>'number' OR jsonb_typeof(s->1)<>'number'
   OR (s->>0)::numeric<0 OR (s->>1)::numeric<extract(epoch FROM g.armed_at)*1000-10000
   OR (s->>1)::numeric>extract(epoch FROM g.expires_at)*1000
   OR jsonb_typeof(s->2)<>'string' OR jsonb_typeof(s->3)<>'string'
   OR (s->>2) NOT IN ('capture-start','capture-stop','round','pointerdown','pointerup','click-handler','intent','request-start','session-ready','fetch-dispatch','response-headers','response-parsed','request-failed','snapshot-accepted','tentative-dom','tentative-frame','confirmed-dom','confirmed-paint-opportunity','long-task','frame-gap','online','offline','visible','hidden','focus','stream-open','stream-renew','stream-lost','subscription-open','subscription-closed','subscription-error','subscription-timeout')
   OR (s->>3)!~'^[0-9a-f]{8}$' OR jsonb_typeof(s->4)<>'number' OR (s->>4)::int NOT BETWEEN 0 AND 3
   OR (s->5<>'null'::jsonb AND jsonb_typeof(s->5)<>'number')
   OR (s->6<>'null'::jsonb AND jsonb_typeof(s->6)<>'object')
  THEN RAISE EXCEPTION 'invalid_timing_sample'; END IF;
  IF jsonb_typeof(s->6)='object' THEN
   FOR k,v IN SELECT * FROM jsonb_each(s->6) LOOP
    IF k NOT IN ('total','auth','database','engine','gate','membership') OR jsonb_typeof(v)<>'number' OR (v::text)::numeric<0 THEN RAISE EXCEPTION 'invalid_timing_span'; END IF;
   END LOOP;
  END IF;
 END LOOP;
 -- One writer at a time per account makes the eight-capture bound concurrency safe.
 INSERT INTO private.run21_timing_captures(user_id,capture_id,mode,samples)
 VALUES(g.user_id,p_capture_id,p_mode,p_samples)
 ON CONFLICT(user_id,capture_id) DO UPDATE SET samples=excluded.samples,updated_at=clock_timestamp();
 DELETE FROM private.run21_timing_captures WHERE user_id=g.user_id AND capture_id IN
 (SELECT capture_id FROM private.run21_timing_captures WHERE user_id=g.user_id ORDER BY updated_at DESC,capture_id OFFSET 8);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.run21_store_timing(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.run21_store_timing(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION private.purge_run21_timing() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 DELETE FROM private.run21_timing_grants WHERE retain_until<=clock_timestamp()
$$;
REVOKE ALL ON FUNCTION private.purge_run21_timing() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('purge-run21-timing-hourly','41 * * * *','SELECT private.purge_run21_timing();');
