CREATE INDEX delayed_matches_organizer ON private.delayed_matches(organizer,created_at DESC,id);
CREATE INDEX delayed_matches_opponent ON private.delayed_matches(opponent,created_at DESC,id);
CREATE INDEX delayed_invites_due ON private.delayed_matches(expires_at) WHERE status='invited';
CREATE INDEX delayed_gameplay_due ON private.delayed_children(gameplay_due_at) WHERE NOT terminal;

CREATE TABLE public.delayed_match_updates (
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id),user_id uuid NOT NULL REFERENCES public.profiles(id),
 revision bigint NOT NULL,PRIMARY KEY(match_id,user_id)
);
ALTER TABLE public.delayed_match_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY delayed_update_owner ON public.delayed_match_updates FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.delayed_match_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.delayed_match_updates TO authenticated;
CREATE FUNCTION private.delayed_signal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.delayed_match_updates VALUES(NEW.id,NEW.organizer,NEW.revision),(NEW.id,NEW.opponent,NEW.revision)
 ON CONFLICT(match_id,user_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER delayed_signal AFTER INSERT OR UPDATE OF revision ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.delayed_signal();
REVOKE ALL ON FUNCTION private.delayed_signal() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',true,'max_children',1,'games',jsonb_build_array(jsonb_build_object('id','ptown-words','rules',private.ptown_words_rules_for('ptown-words/3')))) WHERE auth.uid() IS NOT NULL
$$;
CREATE FUNCTION public.delayed_home(p_match uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;who uuid:=auth.uid();lineup jsonb;net bigint;finished integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'ordinal',c.ordinal,'game',c.game_type,'stake',c.stake,'config',c.config,
  'starter',c.starter,'actor',c.actor,'segment',c.segment,'revision',c.revision,'terminal',c.terminal,
  'availableAt',c.available_at,'lastCallAt',c.last_call_at,'expiresAt',c.expires_at,'startedAt',c.started_at,'scores',c.state->'scores','lastMove',c.state->'moves'->-1,
  'result',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'at',o.completed_at,
   'delta',CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END) ORDER BY c.ordinal),
  coalesce(sum(CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END),0),count(o.child_id)
 INTO lineup,net,finished FROM private.delayed_children c LEFT JOIN private.delayed_outcomes o ON o.child_id=c.id WHERE c.match_id=m.id;
 RETURN jsonb_build_object('id',m.id,'status',m.status,'revision',m.revision,'realMoney',m.real_money,'offerHash',m.offer_hash,
  'organizer',m.organizer,'opponent',m.opponent,'players',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',username)) FROM public.profiles WHERE id IN(m.organizer,m.opponent)),
  'createdAt',m.created_at,'invitationExpiresAt',m.expires_at,'acceptedAt',m.accepted_at,'settledAt',m.settled_at,
  'held',private.delayed_held(m.id),'lineup',lineup,'net',net,'completed',finished,
  'exposure',(SELECT sum(stake) FROM private.delayed_children WHERE match_id=m.id),
  'receipt',(SELECT to_jsonb(s) FROM private.delayed_settlements s WHERE match_id=m.id),
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;
CREATE FUNCTION public.delayed_list(p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(public.delayed_home(id) ORDER BY created_at DESC,id DESC),'[]'::jsonb)
 FROM (SELECT id,created_at FROM private.delayed_matches WHERE auth.uid() IN(organizer,opponent)
 AND (p_before IS NULL OR (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) ORDER BY created_at DESC,id DESC LIMIT 30) m
$$;
-- Names and UUIDs only; account balances never enter opponent selection.
CREATE FUNCTION public.delayed_opponents(p_search text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',username) ORDER BY username),'[]'::jsonb)
 FROM (SELECT id,username FROM public.profiles WHERE auth.uid() IS NOT NULL AND is_active AND id<>auth.uid()
  AND length(trim(p_search)) BETWEEN 2 AND 80 AND position(lower(trim(p_search)) IN lower(username))>0 ORDER BY username,id LIMIT 20) p
$$;
REVOKE ALL ON FUNCTION public.delayed_capabilities(),public.delayed_home(uuid),public.delayed_list(timestamptz,uuid),public.delayed_opponents(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_capabilities(),public.delayed_home(uuid),public.delayed_list(timestamptz,uuid),public.delayed_opponents(text) TO authenticated;
-- Publication membership is installed only with the approved migration.
CREATE FUNCTION public.platform_notification_center() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('actionable',(SELECT count(*) FROM public.platform_notifications WHERE user_id=auth.uid() AND actionable),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY actionable DESC,updated_at DESC),'[]'::jsonb) FROM (
  SELECT * FROM public.platform_notifications WHERE user_id=auth.uid() AND (actionable OR kind IN('settled','invitation_closed'))
  ORDER BY actionable DESC,updated_at DESC,id LIMIT 50) n))
$$;
REVOKE ALL ON FUNCTION public.platform_notification_center() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_notification_center() TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_notifications,public.delayed_match_updates;
