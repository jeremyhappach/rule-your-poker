-- Unapplied; follows Run21's database-issued expiring dispatch lease.
CREATE TABLE private.canasta_recovery_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),token uuid,expires_at timestamptz,
 claimed boolean NOT NULL DEFAULT false,last_completed_at timestamptz,failure text,matches uuid[] NOT NULL DEFAULT '{}');
INSERT INTO private.canasta_recovery_state DEFAULT VALUES;
ALTER TABLE private.canasta_recovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.canasta_recovery_state FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.canasta_dispatch_recovery() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.canasta_recovery_state;t uuid:=gen_random_uuid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled) THEN RETURN;END IF;
 SELECT * INTO STRICT s FROM private.canasta_recovery_state WHERE singleton FOR UPDATE;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN RETURN;END IF;
 UPDATE private.canasta_recovery_state SET token=t,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,
  failure=CASE WHEN s.token IS NOT NULL THEN 'canasta:recovery_lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/canasta-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-canasta-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
END $$;
CREATE FUNCTION public.canasta_recovery_claim(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];
BEGIN
 PERFORM 1 FROM private.canasta_recovery_state WHERE singleton AND token=p_token AND NOT claimed AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"accepted":false}'::jsonb;END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO ids FROM public.canasta_server_due() id;
 UPDATE private.canasta_recovery_state SET claimed=true,matches=ids WHERE singleton;
 RETURN jsonb_build_object('accepted',true,'matches',ids);
END $$;
CREATE FUNCTION public.canasta_recovery_load(p_token uuid,p_match uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.canasta_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp() AND p_match=ANY(matches)) THEN
  RAISE EXCEPTION 'canasta:recovery_token_denied' USING ERRCODE='42501';END IF;
 RETURN public.canasta_server_load(p_match,NULL);
END $$;
CREATE FUNCTION public.canasta_recovery_complete(p_token uuid,p_failure text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.canasta_recovery_state SET token=NULL,claimed=false,matches='{}',failure=left(p_failure,160),
  last_completed_at=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_completed_at END
 WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'canasta:recovery_token_denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION private.canasta_assert_recovery_health() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='canasta-recovery' AND active AND schedule='5 seconds')
  OR NOT EXISTS(SELECT 1 FROM private.canasta_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '20 seconds') THEN
  RAISE EXCEPTION 'canasta:recovery_unhealthy' USING ERRCODE='55000';END IF;
END $$;
REVOKE ALL ON FUNCTION private.canasta_dispatch_recovery(),private.canasta_assert_recovery_health(),public.canasta_recovery_claim(uuid),public.canasta_recovery_load(uuid,uuid),public.canasta_recovery_complete(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.canasta_recovery_claim(uuid),public.canasta_recovery_load(uuid,uuid),public.canasta_recovery_complete(uuid,text) TO service_role;
