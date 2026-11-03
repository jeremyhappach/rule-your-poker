-- Operator-only, short-lived qualification. No browser or service grant writer.
CREATE TABLE private.mega_test_accounts(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE TABLE private.mega_test_live(
 game_id uuid NOT NULL REFERENCES public.games(id) DEFERRABLE INITIALLY DEFERRED,
 user_id uuid NOT NULL REFERENCES private.mega_test_accounts(user_id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(game_id,user_id),CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE TABLE private.mega_test_async(
 actor uuid NOT NULL REFERENCES private.mega_test_accounts(user_id),request_id uuid NOT NULL,
 opponent uuid NOT NULL REFERENCES private.mega_test_accounts(user_id),
 match_id uuid UNIQUE REFERENCES private.delayed_matches(id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(actor,request_id),CHECK(actor<>opponent),CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
ALTER TABLE private.mega_test_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mega_test_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mega_test_async ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mega_test_accounts,private.mega_test_live,private.mega_test_async FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.mega_test_actor(who uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.mega_test_accounts a JOIN auth.users u ON u.id=a.user_id JOIN public.profiles p ON p.id=a.user_id
 WHERE a.user_id=who AND a.expires_at>statement_timestamp() AND p.is_active AND u.raw_app_meta_data->>'mega_synthetic'='true')
$$;
CREATE FUNCTION private.mega_test_live_allowed(who uuid,session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.mega_test_actor(who) AND EXISTS(SELECT FROM private.mega_test_live q JOIN public.games g ON g.id=q.game_id
 WHERE q.user_id=who AND q.game_id=session_id AND q.expires_at>statement_timestamp() AND g.real_money IS FALSE)
$$;
CREATE FUNCTION private.mega_test_async_allowed(who uuid,other uuid,request uuid,match uuid,money boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT money IS FALSE AND private.mega_test_actor(who) AND private.mega_test_actor(other)
 AND EXISTS(SELECT FROM private.mega_test_async q WHERE q.actor=who AND q.opponent=other AND q.expires_at>statement_timestamp()
 AND ((request IS NOT NULL AND q.request_id=request AND q.match_id IS NULL) OR (match IS NOT NULL AND q.match_id=match)))
$$;
-- Restrictive policies keep isolated sessions out of other players' lobby/reads.
CREATE FUNCTION private.mega_test_visible(session_id uuid,who uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT FROM private.mega_test_live WHERE game_id=session_id)
 OR EXISTS(SELECT FROM private.mega_test_live WHERE game_id=session_id AND user_id=who)
$$;
CREATE POLICY mega_test_games_isolated ON public.games AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.mega_test_visible(id,(SELECT auth.uid()))) WITH CHECK(private.mega_test_visible(id,(SELECT auth.uid())));
CREATE POLICY mega_test_players_isolated ON public.players AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.mega_test_visible(game_id,(SELECT auth.uid()))) WITH CHECK(private.mega_test_visible(game_id,(SELECT auth.uid())));
CREATE FUNCTION private.mega_test_game_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM private.mega_test_live WHERE game_id=NEW.id) AND NEW.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'mega:test_fake_only';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_test_game_guard BEFORE INSERT OR UPDATE OF real_money ON public.games FOR EACH ROW EXECUTE FUNCTION private.mega_test_game_guard();
CREATE FUNCTION private.mega_test_player_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM private.mega_test_live WHERE game_id=NEW.game_id) AND (NEW.is_bot OR NOT EXISTS(SELECT FROM private.mega_test_live WHERE game_id=NEW.game_id AND user_id=NEW.user_id)) THEN RAISE EXCEPTION 'mega:test_roster';END IF;
 IF EXISTS(SELECT FROM private.mega_test_accounts WHERE user_id=NEW.user_id) AND EXISTS(SELECT FROM public.games WHERE id=NEW.game_id AND real_money IS DISTINCT FROM false) THEN RAISE EXCEPTION 'mega:test_fake_only';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_test_player_guard BEFORE INSERT OR UPDATE OF user_id,game_id,is_bot ON public.players FOR EACH ROW EXECUTE FUNCTION private.mega_test_player_guard();
CREATE FUNCTION private.mega_test_async_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM private.mega_test_accounts WHERE user_id IN(NEW.organizer,NEW.opponent)) AND
 (NEW.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT FROM private.mega_test_async WHERE match_id=NEW.id AND actor=NEW.organizer AND opponent=NEW.opponent)) THEN RAISE EXCEPTION 'mega:test_offer_scope';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_test_async_guard BEFORE INSERT OR UPDATE OF organizer,opponent,real_money ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.mega_test_async_guard();
REVOKE ALL ON FUNCTION private.mega_test_actor(uuid),private.mega_test_live_allowed(uuid,uuid),private.mega_test_async_allowed(uuid,uuid,uuid,uuid,boolean),private.mega_test_visible(uuid,uuid),private.mega_test_game_guard(),private.mega_test_player_guard(),private.mega_test_async_guard() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.mega_test_visible(uuid,uuid) TO authenticated;
