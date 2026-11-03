-- Local candidate only. Admission remains closed in both money modes.
CREATE TABLE private.mega_competition_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),schema_revision text NOT NULL DEFAULT 'mega-competition/1',live_enabled boolean NOT NULL DEFAULT false,async_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.mega_competition_release DEFAULT VALUES;
ALTER TABLE private.mega_competition_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mega_competition_release FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.game_defaults ADD COLUMN mega_course text NOT NULL DEFAULT 'sunny-meadows',ADD COLUMN mega_holes integer NOT NULL DEFAULT 9 CHECK(mega_holes IN(3,6,9,18));
INSERT INTO public.game_defaults(game_type,ante_amount) VALUES('mega-card-golf',5) ON CONFLICT(game_type) DO NOTHING;
UPDATE public.game_defaults SET presentation_mode='fullscreen' WHERE game_type='mega-card-golf';

CREATE FUNCTION private.mega_competition_config(selection jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c private.arcade_mega_configs;course_i text;holes_i integer;answer jsonb;ruleset_i text;
BEGIN
 SELECT coalesce(selection#>>'{course,id}',mega_course),coalesce((selection#>>'{course,holes}')::integer,mega_holes) INTO course_i,holes_i FROM public.game_defaults WHERE game_type='mega-card-golf';
 SELECT cfg.* INTO c FROM private.arcade_mega_courses catalog JOIN private.arcade_mega_configs cfg ON cfg.id=catalog.config_id WHERE catalog.id=course_i;
 IF NOT FOUND OR NOT coalesce((c.settings->>'enabled')::boolean,false) OR holes_i NOT IN(3,6,9,18) THEN RAISE EXCEPTION 'mega:invalid_course';END IF;
 SELECT id INTO ruleset_i FROM private.arcade_rulesets WHERE game='mega-card-golf' AND id IN('mega-card-golf/1','mega-card-golf/2','mega-card-golf/3','mega-card-golf/4') AND enabled ORDER BY id DESC LIMIT 1;
 IF ruleset_i IS NULL THEN RAISE EXCEPTION 'mega:rules_unavailable';END IF;
 answer:=jsonb_build_object('version',ruleset_i,'course',private.mega_config(c)||jsonb_build_object('holes',holes_i));
 IF selection IS NOT NULL AND selection IS DISTINCT FROM answer THEN RAISE EXCEPTION 'mega:configuration_changed';END IF;
 RETURN answer;
END $$;
CREATE FUNCTION private.mega_competition_courses() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(private.mega_config(c) ORDER BY c.course),'[]') FROM private.arcade_mega_courses a JOIN private.arcade_mega_configs c ON c.id=a.config_id
$$;
CREATE FUNCTION public.mega_competition_catalog(p_game uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'mega:authentication_required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('courses',private.mega_competition_courses(),'defaults',private.mega_competition_config(),'enabled',
  (SELECT live_enabled FROM private.mega_competition_release WHERE singleton) AND (p_game IS NULL OR EXISTS(SELECT FROM public.players WHERE game_id=p_game AND user_id=auth.uid() AND status<>'left')));
END $$;
REVOKE ALL ON FUNCTION private.mega_competition_config(jsonb),private.mega_competition_courses(),public.mega_competition_catalog(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mega_competition_catalog(uuid) TO authenticated;

CREATE FUNCTION private.mega_assert_board(b jsonb,cfg jsonb,prior jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb;i integer:=0;total bigint:=0;d jsonb;
BEGIN
 IF b->'config' IS DISTINCT FROM cfg->'course' OR b->>'ruleset' IS DISTINCT FROM cfg->>'version' OR jsonb_typeof(b->'results') IS DISTINCT FROM 'array'
 OR jsonb_typeof(b->'decks') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'decks')<>(cfg#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_board';END IF;
 IF prior IS NOT NULL AND (b->>'id' IS DISTINCT FROM prior->>'id' OR b->>'owner' IS DISTINCT FROM prior->>'owner' OR b->'decks' IS DISTINCT FROM prior->'decks') THEN RAISE EXCEPTION 'mega:board_identity_changed';END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(b->'decks') LOOP
  IF jsonb_array_length(d)<>52 OR (SELECT count(DISTINCT value::integer) FROM jsonb_array_elements_text(d) WHERE value::integer BETWEEN 0 AND 51)<>52 THEN RAISE EXCEPTION 'mega:invalid_deck';END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(b->'results') LOOP
  i:=i+1;total:=total+private.golf_score(r->'cards');
  IF (r->>'hole')::integer IS DISTINCT FROM i OR (r->>'score')::bigint IS DISTINCT FROM private.golf_score(r->'cards') OR (r->>'total')::bigint IS DISTINCT FROM total
   OR (i<=jsonb_array_length(coalesce(prior->'results','[]')) AND r IS DISTINCT FROM prior->'results'->(i-1)) THEN RAISE EXCEPTION 'mega:invalid_hole_result';END IF;
 END LOOP;
 IF (b->>'score')::bigint IS DISTINCT FROM total OR i<jsonb_array_length(coalesce(prior->'results','[]')) OR i>(cfg#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
END $$;
REVOKE ALL ON FUNCTION private.mega_assert_board(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.mega_live_matches(
 dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),round_id uuid NOT NULL REFERENCES public.rounds(id),
 state jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),
 settlement jsonb,finished boolean NOT NULL DEFAULT false,paused_at bigint,player_controls jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX mega_live_due ON private.mega_live_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND paused_at IS NULL;
CREATE TABLE private.mega_live_requests(dealer_game_id uuid NOT NULL REFERENCES private.mega_live_matches(dealer_game_id),request_id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(dealer_game_id,request_id));
ALTER TABLE private.mega_live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mega_live_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mega_live_matches,private.mega_live_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.mega_live_revisions(dealer_game_id uuid PRIMARY KEY REFERENCES private.mega_live_matches(dealer_game_id),game_id uuid NOT NULL,revision bigint NOT NULL);
ALTER TABLE public.mega_live_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mega_live_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.mega_live_revisions TO authenticated;
CREATE POLICY mega_live_members ON public.mega_live_revisions FOR SELECT TO authenticated USING(EXISTS(SELECT FROM public.players WHERE game_id=mega_live_revisions.game_id AND user_id=(SELECT auth.uid()) AND status<>'left'));
DO $$BEGIN IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.mega_live_revisions;END IF;END $$;

CREATE FUNCTION private.mega_live_actor_allowed(actor uuid,session_id uuid DEFAULT NULL,match_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND ((SELECT live_enabled FROM private.mega_competition_release WHERE singleton)
 OR EXISTS(SELECT FROM public.dealer_games d WHERE d.session_id=mega_live_actor_allowed.session_id AND d.game_type='mega-card-golf' AND (match_id IS NULL OR d.id=match_id)))
$$;
CREATE FUNCTION private.mega_live_admission_allowed(actor uuid,session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND (SELECT live_enabled FROM private.mega_competition_release WHERE singleton)
$$;
CREATE FUNCTION private.mega_live_supported_rules(rules jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT rules->>'version' IN('mega-card-golf/1','mega-card-golf/2','mega-card-golf/3','mega-card-golf/4') AND rules#>'{course,holes}' IN('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) AND rules->'holes'=rules#>'{course,holes}'
$$;
CREATE FUNCTION private.mega_live_record(m private.mega_live_matches,actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(m)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000),'viewer',(SELECT id FROM public.players WHERE game_id=m.game_id AND user_id=actor AND NOT is_bot),
 'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id::text,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id::text,chips) FROM public.session_player_snapshots WHERE dealer_game_id=m.dealer_game_id AND hand_number=1) END,
 'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='mega_live_terminal'),
 'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=m.dealer_game_id ORDER BY cursor DESC LIMIT 1)))
$$;
CREATE FUNCTION private.mega_live_authorize(m private.mega_live_matches,actor uuid,token uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF actor IS NULL THEN
  IF NOT EXISTS(SELECT FROM private.delayed_recovery_state r WHERE r.singleton AND r.claimed AND r.token=mega_live_authorize.token AND r.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'mega:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.mega_live_actor_allowed(actor,m.game_id,m.dealer_game_id) OR NOT EXISTS(SELECT FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor AND p.status<>'left') THEN RAISE EXCEPTION 'mega:participant_required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.mega_live_load(p_match uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;r private.mega_live_requests;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'mega:authentication_required';END IF;
 PERFORM private.mega_live_authorize(m,p_actor);
 SELECT * INTO r FROM private.mega_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
 RETURN private.mega_live_record(m,p_actor)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $$;
CREATE FUNCTION private.mega_live_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.mega_live_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision) ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_live_publish AFTER INSERT OR UPDATE ON private.mega_live_matches FOR EACH ROW EXECUTE FUNCTION private.mega_live_publish();
CREATE FUNCTION private.mega_live_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.dealer_game_id IS DISTINCT FROM OLD.dealer_game_id OR NEW.stake IS DISTINCT FROM OLD.stake OR NEW.round_id IS DISTINCT FROM OLD.round_id
 OR NEW.state->'identity' IS DISTINCT FROM OLD.state->'identity' OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules' OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players'
 OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement OR NEW.state-ARRAY['terminal','presentation','deadline','board'] IS DISTINCT FROM OLD.state-ARRAY['terminal','presentation','deadline','board']
 OR (NEW.state->'terminal')-ARRAY['startedAt','deadline'] IS DISTINCT FROM (OLD.state->'terminal')-ARRAY['startedAt','deadline']
 OR (NEW.state->'board')-ARRAY['deadline','revision'] IS DISTINCT FROM (OLD.state->'board')-ARRAY['deadline','revision'])) THEN RAISE EXCEPTION 'mega:immutable_match';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_live_guard BEFORE UPDATE ON private.mega_live_matches FOR EACH ROW EXECUTE FUNCTION private.mega_live_guard();
