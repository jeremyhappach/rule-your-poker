-- UNAPPLIED. Install only with the qualified bundled worker and admission changes.
-- Existing games are deliberately excluded: no historical recovery/backfill.
CREATE TABLE private.run21_recovery_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  token uuid, expires_at timestamptz, claimed boolean NOT NULL DEFAULT false,
  last_completed_at timestamptz, failure text, games uuid[] NOT NULL DEFAULT '{}'
);
INSERT INTO private.run21_recovery_state(singleton) VALUES(true);
ALTER TABLE private.run21_recovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_recovery_state FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.run21_dispatch_recovery() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.run21_recovery_state; token_i uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT s FROM private.run21_recovery_state WHERE singleton FOR UPDATE;
  IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN RETURN; END IF;
  UPDATE private.run21_recovery_state SET token=token_i,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,
    failure=CASE WHEN s.token IS NOT NULL THEN 'run21:recovery_lease_expired' ELSE failure END WHERE singleton;
  PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/run21-recovery',
    headers:=jsonb_build_object('Content-Type','application/json','x-run21-dispatch',token_i::text),
    body:='{}'::jsonb,timeout_milliseconds:=20000);
END $$;
REVOKE ALL ON FUNCTION private.run21_dispatch_recovery() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.run21_recovery_claim(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected_games uuid[];
BEGIN
  PERFORM 1 FROM private.run21_recovery_state WHERE singleton AND token=p_token
    AND expires_at>clock_timestamp() AND NOT claimed FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false); END IF;
  SELECT coalesce(array_agg(game_id),'{}'::uuid[]) INTO selected_games FROM (
    SELECT m.game_id FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
    WHERE m.financial_version=2 AND NOT m.finished AND nullif(m.state->'settlement','null'::jsonb) IS NULL
      AND g.status='in_progress' AND g.current_game_uuid=m.dealer_game_id AND g.game_type='run21' AND NOT g.is_paused
      AND (m.state IS NULL OR nullif(m.state->>'winnerId','') IS NOT NULL
        OR m.state#>>'{rounds,-1,revealed}'='true'
        OR (m.state#>>'{rounds,-1,scorePresentation,endsAt}')::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','deadline'])::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','firstPlacementDeadline'])::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR m.bot_due_at<=extract(epoch FROM clock_timestamp())*1000)
    ORDER BY m.created_at LIMIT 20
  ) candidates;
  UPDATE private.run21_recovery_state SET claimed=true,games=selected_games WHERE singleton;
  RETURN jsonb_build_object('accepted',true,'games',selected_games);
END $$;

CREATE FUNCTION public.run21_recovery_load(p_token uuid,p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.run21_recovery_state WHERE singleton AND token=p_token AND claimed
    AND expires_at>clock_timestamp() AND p_game_id=ANY(games)) THEN
    RAISE EXCEPTION 'run21:recovery_token_denied' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('dealer_user_id',d.dealer_user_id))
    FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id JOIN public.dealer_games d ON d.id=m.dealer_game_id
    WHERE m.game_id=p_game_id AND m.financial_version=2 AND NOT m.finished
      AND g.current_game_uuid=m.dealer_game_id AND g.status='in_progress' AND NOT g.is_paused),'[]'::jsonb);
END $$;

CREATE FUNCTION public.run21_recovery_complete(p_token uuid,p_failure text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE private.run21_recovery_state SET token=NULL,claimed=false,games='{}',
    last_completed_at=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_completed_at END,
    failure=left(p_failure,160)
  WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'run21:recovery_token_denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.run21_recovery_claim(uuid),public.run21_recovery_load(uuid,uuid),public.run21_recovery_complete(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_recovery_claim(uuid),public.run21_recovery_load(uuid,uuid),public.run21_recovery_complete(uuid,text) TO service_role;

CREATE FUNCTION private.run21_assert_recovery_health(p_game_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE health jsonb;
BEGIN
  health:=private.evaluate_real_money_liveness(p_game_id);
  IF NOT coalesce((health->>'admission_allowed')::boolean,false) THEN
    RAISE EXCEPTION 'real_money_liveness_unavailable:%',health->>'reason' USING ERRCODE='55000',DETAIL=health::text;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='run21-recovery' AND active AND schedule='5 seconds')
    OR NOT EXISTS(SELECT 1 FROM private.run21_recovery_state WHERE singleton AND failure IS NULL
      AND last_completed_at>clock_timestamp()-interval '20 seconds') THEN
    RAISE EXCEPTION 'real_money_liveness_unavailable:run21_recovery_unhealthy' USING ERRCODE='55000';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.run21_assert_recovery_health(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No cron.schedule here: installation is a separate, qualification-gated step.
