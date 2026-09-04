-- Stable participant identity is independent of game-specific action guards.
CREATE OR REPLACE FUNCTION private.guard_participant_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF ROW(NEW.id,NEW.game_id,NEW.user_id,NEW.is_bot)
     IS DISTINCT FROM ROW(OLD.id,OLD.game_id,OLD.user_id,OLD.is_bot) THEN
    RAISE EXCEPTION 'participant_identity:immutable_identity' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_participant_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_participant_identity ON public.players;
CREATE TRIGGER guard_participant_identity BEFORE UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION private.guard_participant_identity();

DROP POLICY "Users can insert themselves or bots as players" ON public.players;
CREATE POLICY "Users can insert their own human participant" ON public.players
FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id AND is_bot=false);
DROP POLICY "Users can insert own profile or bot profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT TO authenticated WITH CHECK(auth.uid()=id);

CREATE OR REPLACE FUNCTION public.create_session_bot(
 _game_id uuid,_bot_id uuid,_aggression_level text,_position integer,
 _sitting_out boolean DEFAULT false,_waiting boolean DEFAULT false,
 _actor_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE
 _next integer; _name text; _suffix text; _player public.players;
 _game public.games; _actor uuid:=auth.uid();
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'create_session_bot:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO _game FROM public.games WHERE id=_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'create_session_bot:game_not_found'; END IF;
 IF _game.current_host IS DISTINCT FROM _actor AND NOT public.has_role(_actor,'admin'::public.app_role) THEN
   RAISE EXCEPTION 'create_session_bot:host_required' USING ERRCODE='42501';
 END IF;
 IF _game.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'create_session_bot:fake_money_only' USING ERRCODE='42501'; END IF;
 IF _game.status IN ('completed','session_ended','game_over') THEN RAISE EXCEPTION 'create_session_bot:terminal_game'; END IF;
 IF _bot_id IS NULL OR _position IS NULL OR _position NOT BETWEEN 1 AND 7
    OR coalesce(_aggression_level,'normal') NOT IN ('very_conservative','conservative','normal','aggressive','very_aggressive') THEN
   RAISE EXCEPTION 'create_session_bot:invalid_request';
 END IF;
 -- The caller's UUID is an operation identity, never a replacement identity.
 SELECT * INTO _player FROM public.players WHERE game_id=_game_id AND user_id=_bot_id;
 IF FOUND THEN
   IF NOT _player.is_bot THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
   SELECT username INTO _name FROM public.profiles WHERE id=_bot_id;
   SELECT (event_data->>'bot_alias_ordinal')::integer INTO _next FROM public.session_events
    WHERE game_id=_game_id AND event_type='bot_added' AND event_data->>'bot_id'=_bot_id::text LIMIT 1;
   RETURN jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=_bot_id) THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=_game_id AND position=_position) THEN
   RAISE EXCEPTION 'Seat % is already occupied',_position;
 END IF;
 _next:=public.allocate_bot_alias_number(_game_id);
 _name:='Bot '||_next::text;
 _suffix:=substr(replace(_bot_id::text,'-',''),1,6);
 IF EXISTS(SELECT 1 FROM public.profiles WHERE username=_name) THEN _name:=_name||'-'||_suffix; END IF;
 INSERT INTO public.profiles(id,username,aggression_level)
 VALUES(_bot_id,_name,coalesce(_aggression_level,'normal'));
 INSERT INTO public.players(user_id,game_id,position,chips,is_bot,status,sitting_out,waiting)
 VALUES(_bot_id,_game_id,_position,0,true,'active',
   _game.status='in_progress' OR coalesce(_sitting_out,false),
   _game.status='in_progress' OR coalesce(_waiting,false))
 RETURNING * INTO _player;
 INSERT INTO public.session_events(game_id,event_type,event_data,user_id)
 VALUES(_game_id,'bot_added',jsonb_build_object('position',_position,'bot_username',_name,
   'bot_alias_ordinal',_next,'bot_id',_bot_id),_actor);
 RETURN jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',false);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid) TO authenticated;
-- Allocation is internal to atomic bot creation; the old browser adapter has no callers.
REVOKE EXECUTE ON FUNCTION public.allocate_bot_alias_number(uuid) FROM PUBLIC,anon,authenticated;

-- Public roster/preference reads never include contact information.
REVOKE SELECT ON public.profiles FROM PUBLIC,anon,authenticated;
REVOKE SELECT(email) ON public.profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,username,created_at,is_superuser,table_layout,card_back_design,deck_color_mode,
 is_active,aggression_level,last_seen_at,use_haptic,play_sounds,mute_dealer_chat,
 network_sim_mode,network_sim_logging) ON public.profiles TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_profiles()
RETURNS TABLE(id uuid,username text,is_active boolean,is_superuser boolean,
 created_at timestamptz,last_seen_at timestamptz,email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
   RAISE EXCEPTION 'admin_profiles:admin_required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT p.id,p.username,p.is_active,p.is_superuser,p.created_at,p.last_seen_at,p.email
 FROM public.profiles p WHERE p.username NOT ILIKE 'Bot %' ORDER BY p.username;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_get_profiles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_profiles() TO authenticated;
NOTIFY pgrst,'reload schema';
