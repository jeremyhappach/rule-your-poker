-- Local candidate only. No gameplay deadline, scoring, admission or settlement changes.
CREATE INDEX IF NOT EXISTS delayed_word_commands_child_idx ON private.delayed_word_commands(child_id);
CREATE OR REPLACE FUNCTION public.delayed_opponent_page(p_search text DEFAULT '',p_sort text DEFAULT 'username',p_after jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;needle text:=lower(trim(coalesce(p_search,'')));
BEGIN
 PERFORM private.delayed_actor(auth.uid());
 IF length(needle)>80 OR p_sort NOT IN('username','recent') THEN RAISE EXCEPTION 'delayed:invalid_filter';END IF;
 IF p_after IS NOT NULL AND (p_after->>'sort' IS DISTINCT FROM p_sort OR p_after->>'search' IS DISTINCT FROM needle) THEN RAISE EXCEPTION 'delayed:invalid_cursor';END IF;
 WITH candidates AS (
  SELECT p.id,p.username,lower(p.username) name_key,
   (SELECT max(greatest(m.settled_at,m.accepted_at,
     (SELECT max(to_timestamp((cmd.response->>'serverAt')::double precision/1000))
      FROM private.delayed_children c JOIN private.delayed_word_commands cmd ON cmd.child_id=c.id
      WHERE c.match_id=m.id AND NOT cmd.response?'error'))) FROM private.delayed_matches m
    WHERE m.accepted_at IS NOT NULL AND (m.organizer=auth.uid() AND m.opponent=p.id OR m.opponent=auth.uid() AND m.organizer=p.id)) last_played
  FROM public.profiles p WHERE p.is_active AND p.id<>auth.uid() AND position(needle IN lower(p.username))>0
 ), keyed AS (
  SELECT *,CASE WHEN p_sort='recent' THEN -coalesce(extract(epoch FROM last_played),0) ELSE 0 END time_key FROM candidates
 ), page AS (
  SELECT * FROM keyed WHERE p_after IS NULL OR (time_key,name_key,id)>((p_after->>'time')::numeric,p_after->>'name',(p_after->>'id')::uuid)
  ORDER BY time_key,name_key,id LIMIT 51
 ), visible AS (SELECT * FROM page ORDER BY time_key,name_key,id LIMIT 50)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',username) ORDER BY time_key,name_key,id) FROM visible),'[]'::jsonb),
  'hasMore',(SELECT count(*)>50 FROM page),'next',CASE WHEN (SELECT count(*)>50 FROM page) THEN
   (SELECT jsonb_build_object('time',time_key::text,'name',name_key,'id',id,'sort',p_sort,'search',needle) FROM visible ORDER BY time_key DESC,name_key DESC,id DESC LIMIT 1) END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.delayed_opponent_page(text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_opponent_page(text,text,jsonb) TO authenticated;

-- A separate immutable acceptance obligation survives reconnect/replayed accept requests.
ALTER TABLE public.platform_notifications DROP CONSTRAINT platform_notifications_kind_check;
ALTER TABLE public.platform_notifications ADD CONSTRAINT platform_notifications_kind_check CHECK(kind IN('invitation','turn','settled','invitation_closed','accepted'));
CREATE FUNCTION private.delayed_acceptance_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
  INSERT INTO public.platform_notifications(user_id,match_id,kind,actionable,payload)
  VALUES(NEW.organizer,NEW.id,'accepted',false,jsonb_build_object('status','accepted','opponentId',NEW.opponent,'availableCount',0,'earliestDeadline',NULL,'lastCall',false))
  ON CONFLICT(user_id,match_id,kind) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.delayed_acceptance_notice() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delayed_acceptance_notice AFTER UPDATE OF accepted_at ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.delayed_acceptance_notice();
CREATE OR REPLACE FUNCTION public.platform_notification_center() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('actionable',(SELECT count(*) FROM public.platform_notifications WHERE user_id=auth.uid() AND (actionable OR kind IN('accepted','settled','invitation_closed') AND read_revision<revision)),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY actionable DESC,updated_at DESC),'[]'::jsonb) FROM (
  SELECT * FROM public.platform_notifications WHERE user_id=auth.uid() AND (actionable OR kind IN('settled','invitation_closed','accepted'))
  ORDER BY actionable DESC,updated_at DESC,id LIMIT 50) n))
$$;
-- Async orchestration publishes the same presentation shape, without changing
-- its 36-hour availability deadline or invoking live session timing/finances.
CREATE FUNCTION private.delayed_words_present_move() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE config jsonb;move jsonb;squares jsonb;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);announce_at bigint;
BEGIN
 IF NEW.game_type<>'ptown-words' OR NEW.state IS NULL THEN RETURN NEW;END IF;
 config:=coalesce(OLD.state->'presentationConfig',private.ptown_words_presentation_config());
 NEW.state:=NEW.state||jsonb_build_object('presentationConfig',config);
 IF OLD.state IS NULL OR (NEW.state->>'turn')::int IS NOT DISTINCT FROM (OLD.state->>'turn')::int THEN RETURN NEW;END IF;
 NEW.state:=NEW.state-'movePresentation';move:=NEW.state->'moves'->-1;
 IF (NEW.state->>'turn')::int<>(OLD.state->>'turn')::int+1 OR move->>'action'<>'place' THEN RETURN NEW;END IF;
 SELECT jsonb_agg(i ORDER BY i) INTO squares FROM generate_series(0,224)i WHERE OLD.state->'board'->i='null'::jsonb AND NEW.state->'board'->i<>'null'::jsonb;
 announce_at:=at_ms+(config->>'focusMs')::int+jsonb_array_length(squares)*(config->>'flipMs')::int;
 NEW.state:=NEW.state||jsonb_build_object('movePresentation',jsonb_build_object('version',1,'turn',move->'turn','playerId',move->'playerId',
  'squares',squares,'startedAt',at_ms,'announceAt',announce_at,'readyAt',announce_at+(config->>'noticeMs')::int+(config->>'holdMs')::int,
  'flipMs',config->'flipMs','focusMs',config->'focusMs','noticeMs',config->'noticeMs'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_present_move() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delayed_words_present_move BEFORE UPDATE OF state ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.delayed_words_present_move();
-- New deals freeze this presentation budget; existing schedules remain unchanged.
-- 1s points hold + 600ms flight/count-up + 2s final hold, after tile reveal.
CREATE OR REPLACE FUNCTION private.ptown_words_presentation_config() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":1,"focusMs":800,"flipMs":300,"noticeMs":3250,"holdMs":350}'::jsonb
$$;
