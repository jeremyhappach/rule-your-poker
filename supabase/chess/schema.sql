-- Closed-admission candidate. No hosted application or activation authorized.
CREATE TABLE private.chess_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,admission_enabled boolean NOT NULL DEFAULT false,async_enabled boolean NOT NULL DEFAULT false,real_qualified boolean NOT NULL DEFAULT false,bots_enabled boolean NOT NULL DEFAULT false CHECK(NOT bots_enabled));
INSERT INTO private.chess_release DEFAULT VALUES;
ALTER TABLE private.chess_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.chess_release FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.chess_matches(dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),round_id uuid NOT NULL REFERENCES public.rounds(id),state jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),settlement jsonb,finished boolean NOT NULL DEFAULT false,paused_at bigint);
ALTER TABLE private.chess_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.chess_matches FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX chess_due ON private.chess_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND paused_at IS NULL;
CREATE TABLE private.chess_requests(mode text NOT NULL CHECK(mode IN('live','async')),match_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,fingerprint jsonb NOT NULL,PRIMARY KEY(mode,match_id,request_id));
ALTER TABLE private.chess_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.chess_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.chess_revisions(dealer_game_id uuid PRIMARY KEY REFERENCES private.chess_matches(dealer_game_id),game_id uuid NOT NULL,revision bigint NOT NULL);
ALTER TABLE public.chess_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chess_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.chess_revisions TO authenticated;
CREATE POLICY chess_members ON public.chess_revisions FOR SELECT TO authenticated USING(EXISTS(SELECT FROM public.players WHERE game_id=chess_revisions.game_id AND user_id=(SELECT auth.uid()) AND status<>'left'));
DO $$BEGIN IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_revisions;END IF;END $$;
CREATE FUNCTION private.chess_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN INSERT INTO public.chess_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision) ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;RETURN NEW;END $$;
CREATE TRIGGER chess_publish AFTER INSERT OR UPDATE ON private.chess_matches FOR EACH ROW EXECUTE FUNCTION private.chess_publish();
-- Preview admission is restricted while the shared backend also serves production.
CREATE TABLE private.chess_preview_users(actor uuid PRIMARY KEY REFERENCES public.profiles(id));
ALTER TABLE private.chess_preview_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.chess_preview_users FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.chess_release ADD COLUMN preview_only boolean NOT NULL DEFAULT true;
CREATE FUNCTION private.chess_actor_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND private.account_enabled(actor)
 AND (NOT (SELECT preview_only FROM private.chess_release WHERE singleton) OR EXISTS(SELECT FROM private.chess_preview_users WHERE chess_preview_users.actor=chess_actor_allowed.actor))
$$;
CREATE FUNCTION public.chess_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',1,'user_id',auth.uid(),'session_id',p_session_id,'enabled',private.chess_actor_allowed(auth.uid()) AND enabled AND admission_enabled AND (p_session_id IS NULL OR EXISTS(SELECT FROM public.games WHERE id=p_session_id AND (NOT real_money OR real_qualified))),'fake_money_only',NOT real_qualified) FROM private.chess_release WHERE singleton
$$;
INSERT INTO public.game_defaults(game_type,ante_amount,presentation_mode) VALUES('chess',5,'fullscreen') ON CONFLICT(game_type) DO NOTHING;

CREATE FUNCTION private.chess_seed(s jsonb,mode_i text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE fen text:='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
BEGIN
 IF jsonb_array_length(s->'players')<>2 OR EXISTS(SELECT FROM jsonb_array_elements(s->'players') p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:two_humans_required';END IF;
 RETURN s||jsonb_build_object('rules',private.chess_rules(),'mode',mode_i,'backgroundId',private.choose_game_background(),'initialFen',fen,'fen',fen,'phase','playing','turnIndex',0,'turn',1,'opened',mode_i='live','clockDuration',(private.chess_rules()->>'turnMs')::bigint,'deadline',at_ms+(private.chess_rules()->>CASE WHEN mode_i='live' THEN 'turnMs' ELSE 'availabilityMs' END)::bigint,'moves','[]'::jsonb,'captured','{"w":[],"b":[]}'::jsonb,'banks',(SELECT jsonb_object_agg(p->>'id','[]'::jsonb) FROM jsonb_array_elements(s->'players') p),'positions',jsonb_build_array('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -||'),'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(s->'players') p),'winnerIds','[]'::jsonb);
END $$;
