-- Adapted from the established Canasta recovery lease. No browser bot authority.
CREATE TABLE private.chess_bot_recovery(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),token uuid,expires_at timestamptz,claimed boolean NOT NULL DEFAULT false,last_completed_at timestamptz,failure text,matches uuid[] NOT NULL DEFAULT '{}');
INSERT INTO private.chess_bot_recovery DEFAULT VALUES;
ALTER TABLE private.chess_bot_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.chess_bot_recovery FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX chess_bot_due ON private.chess_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND state ? 'bot';

CREATE FUNCTION private.chess_bot_health() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM cron.job WHERE jobname='chess-bot-recovery' AND active AND schedule='5 seconds') OR NOT EXISTS(SELECT FROM private.chess_bot_recovery WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'chess:bot_recovery_unhealthy';END IF;
END $$;
CREATE FUNCTION private.chess_dispatch_bots() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.chess_bot_recovery;t uuid:=gen_random_uuid();
BEGIN
 -- Keep already-admitted bot games recoverable if new bot admission is closed.
 IF NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND bots_enabled) AND NOT EXISTS(SELECT FROM private.chess_matches WHERE NOT finished AND settlement IS NULL AND state ? 'bot') THEN RETURN;END IF;
 SELECT * INTO STRICT s FROM private.chess_bot_recovery WHERE singleton FOR UPDATE;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN RETURN;END IF;
 UPDATE private.chess_bot_recovery SET token=t,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,matches='{}',failure=CASE WHEN s.token IS NOT NULL THEN 'chess:bot_lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/chess-recovery',headers:=jsonb_build_object('Content-Type','application/json','x-chess-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
END $$;
CREATE FUNCTION public.chess_bot_claim(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 PERFORM 1 FROM private.chess_bot_recovery WHERE singleton AND token=p_token AND NOT claimed AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"accepted":false}'::jsonb;END IF;
 SELECT coalesce(array_agg(dealer_game_id),'{}'::uuid[]) INTO ids FROM (
  SELECT m.dealer_game_id FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id
  WHERE NOT m.finished AND m.settlement IS NULL AND m.paused_at IS NULL AND m.state ? 'bot' AND g.real_money=false AND NOT g.is_paused
   AND m.state->>'phase'='playing' AND (m.state->'players'->(m.state->>'turnIndex')::int->>'isBot')::boolean
   AND (m.state->>'deadline')::bigint-(m.state->>'clockDuration')::bigint+1000<=at_ms
  ORDER BY (m.state->>'deadline')::bigint,m.dealer_game_id LIMIT 1
 ) due;
 UPDATE private.chess_bot_recovery SET claimed=true,matches=ids WHERE singleton;
 RETURN jsonb_build_object('accepted',true,'matches',ids);
END $$;
CREATE FUNCTION private.chess_bot_assert_lease(p_token uuid,p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM private.chess_bot_recovery WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp() AND p_id=ANY(matches) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'chess:recovery_token_denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.chess_bot_load(p_token uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.chess_matches;
BEGIN
 PERFORM private.chess_bot_assert_lease(p_token,p_id);PERFORM private.chess_sync('live',p_id);
 SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=p_id;
 IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.state->>'phase'<>'playing' OR NOT (m.state->'players'->(m.state->>'turnIndex')::int->>'isBot')::boolean THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state',m.state,'revision',m.revision,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
END $$;
CREATE FUNCTION public.chess_bot_commit(p_token uuid,p_id uuid,p_revision bigint,p_actor uuid,p_state jsonb,p_intent jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.chess_bot_assert_lease(p_token,p_id);
 IF p_intent->>'type' IS DISTINCT FROM 'move' THEN RAISE EXCEPTION 'chess:bot_move_required';END IF;
 RETURN private.chess_commit_impl('live',p_id,p_actor,p_revision,p_state,p_token,jsonb_build_object('revision',p_revision,'intent',p_intent),true);
END $$;
CREATE FUNCTION public.chess_bot_complete(p_token uuid,p_failure text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.chess_bot_recovery SET token=NULL,claimed=false,matches='{}',failure=left(p_failure,160),last_completed_at=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_completed_at END WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'chess:recovery_token_denied' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION private.chess_bot_health(),private.chess_dispatch_bots(),private.chess_bot_assert_lease(uuid,uuid),public.chess_bot_claim(uuid),public.chess_bot_load(uuid,uuid),public.chess_bot_commit(uuid,uuid,bigint,uuid,jsonb,jsonb),public.chess_bot_complete(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.chess_bot_claim(uuid),public.chess_bot_load(uuid,uuid),public.chess_bot_commit(uuid,uuid,bigint,uuid,jsonb,jsonb),public.chess_bot_complete(uuid,text) TO service_role;
SELECT cron.schedule('chess-bot-recovery','5 seconds','SELECT private.chess_dispatch_bots()');
