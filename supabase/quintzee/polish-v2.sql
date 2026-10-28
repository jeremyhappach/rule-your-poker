-- LOCAL qualification only. Shared dispatch preserves frozen v1 in-progress runs.
CREATE OR REPLACE FUNCTION private.quintzee_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$ BEGIN
 IF b#>>'{rules,version}'='quintzee/2' THEN RETURN private.quintzee_v2_board_reduce(b,action,items,at_ms);END IF;
 RETURN private.quintzee_v1_board_reduce(b,action,items,at_ms);END $$;
CREATE OR REPLACE FUNCTION private.quintzee_start_core(players uuid[],r jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF r->>'version'='quintzee/2' THEN RETURN private.quintzee_v2_start(players,r,at_ms);END IF;RETURN private.quintzee_v1_start(players,r,at_ms);END $$;
CREATE OR REPLACE FUNCTION private.quintzee_reduce_core(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$ BEGIN
 IF s#>>'{rules,version}'='quintzee/2' THEN RETURN private.quintzee_v2_reduce(s,action,items,at_ms);END IF;RETURN private.quintzee_v1_reduce(s,action,items,at_ms);END $$;
CREATE OR REPLACE FUNCTION private.quintzee_board_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF s#>>'{rules,version}'='quintzee/2' THEN RETURN private.quintzee_v2_board_start((s->'rules')-'theme',at_ms,coalesce((s->>'score')::bigint,0));END IF;RETURN private.quintzee_v1_board_start((s->'rules')-'theme',at_ms,coalesce((s->>'score')::bigint,0));END $$;
DO $patch$ DECLARE f record;s text;BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname IN('quintzee_deal','quintzee_match_reduce','arcade_quintzee_advance')) OR (n.nspname='public' AND p.proname IN('arcade_quintzee_step','quintzee_action','quintzee_configure')) LOOP
 s:=pg_get_functiondef(f.oid);s:=replace(s,'private.quintzee_v1_start(','private.quintzee_start_core(');s:=replace(s,'private.quintzee_v1_reduce(','private.quintzee_reduce_core(');s:=replace(s,'private.quintzee_v1_board_reduce(','private.quintzee_board_reduce(');
 s:=replace(s,'private.quintzee_v1_rules()','private.quintzee_v2_rules()');
 s:=replace(s,'NOT IN (''roll'',''score'')','NOT IN (''start'',''roll'',''score'',''score_zero'')');s:=replace(s,'NOT IN(''roll'',''score'',''abandon'')','NOT IN(''start'',''roll'',''score'',''score_zero'',''abandon'')');
 IF s LIKE '%FUNCTION private.arcade_quintzee_advance(%' THEN
 s:=replace(s,'IF s#>>''{board,phase}''=''stage_complete'' THEN','IF s#>>''{board,phase}''=''ready'' THEN RETURN s||jsonb_build_object(''status'',''expired'');END IF; IF s#>>''{board,phase}''=''stage_complete'' THEN');END IF;
 EXECUTE s;
 END LOOP;
END $patch$;
-- Cosmetic choice is frozen by the existing atomic, replay-safe admission owner.
DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
 s:=replace(s,'coalesce((SELECT quintzee_theme FROM public.game_defaults WHERE game_type=''quintzee''),''classic'')','coalesce(nullif(current_setting(''app.quintzee_theme'',true),''''),''modern'')');EXECUTE s;END $patch$;
CREATE OR REPLACE FUNCTION public.arcade_quintzee_start(p_actor uuid,p_request uuid,p_theme text DEFAULT 'modern') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE v jsonb;old text:=current_setting('app.quintzee_theme',true);BEGIN
 IF p_theme NOT IN('classic','modern') OR p_theme IS NULL THEN RAISE EXCEPTION 'quintzee:theme';END IF;
 PERFORM set_config('app.quintzee_theme',p_theme,true);v:=public.arcade_start(p_actor,p_request,'quintzee');PERFORM set_config('app.quintzee_theme',coalesce(old,''),true);RETURN v;END $$;
REVOKE ALL ON FUNCTION public.arcade_quintzee_start(uuid,uuid,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.arcade_quintzee_start(uuid,uuid,text) TO service_role;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('quintzee/2','quintzee',private.quintzee_v2_rules(),false);
-- Bots use only visible dice; choosing an intentional zero is explicit.
DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('private.quintzee_bot_choice(jsonb,bigint)'::regprocedure);
 s:=replace(s,'BEGIN','BEGIN IF b->>''phase''=''ready'' AND at_ms<=(b->>''deadline'')::bigint THEN RETURN jsonb_build_object(''action'',''start'',''items'',''[]''::jsonb);END IF;');
 s:=replace(s,chr(13),'');s:=replace(s,'RETURN NULL;'||chr(10)||'END', 'IF b#>>''{rules,version}''=''quintzee/2'' THEN SELECT c INTO category FROM unnest(private.quintzee_v2_categories()) c WHERE NOT (b->''scores'') ? c LIMIT 1;RETURN jsonb_build_object(''action'',''score_zero'',''items'',jsonb_build_array(array_position(private.quintzee_v2_categories(),category)-1));END IF;RETURN NULL;'||chr(10)||'END');EXECUTE s;
 s:=pg_get_functiondef('private.quintzee_schedule_bot()'::regprocedure);s:=replace(s,'''intro'',''playing''','''intro'',''ready'',''playing''');EXECUTE s;
END $patch$;
-- Admitted fake-money matches finish through legal autoplay, including all-away.
CREATE OR REPLACE FUNCTION private.quintzee_ready_timeout(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.quintzee_matches;g public.games;p uuid;due bigint;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_id;SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.real_money IS DISTINCT FROM false OR g.is_paused OR m.state->>'phase'<>'ready' THEN RETURN;END IF;
 p:=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid;due:=(m.state->>'deadline')::bigint;IF due>at_ms THEN RETURN;END IF;
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p AND NOT is_bot;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_reduce(state,'start','{}',due),revision=revision+1 WHERE dealer_game_id=p_id;
END $$;
DO $patch$ DECLARE s text;BEGIN
 s:=pg_get_functiondef('private.quintzee_recover()'::regprocedure);
 s:=replace(s,'IF (m.state->>''deadline'')::bigint<=at_ms THEN','IF m.state->>''phase''=''ready'' AND (m.state->>''deadline'')::bigint<=at_ms THEN PERFORM private.quintzee_ready_timeout(m.dealer_game_id);count_i:=count_i+1;CONTINUE;END IF; IF (m.state->>''deadline'')::bigint<=at_ms THEN');EXECUTE s;
END $patch$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND (p.proname LIKE 'quintzee_v2_%' OR p.proname IN('quintzee_board_reduce','quintzee_start_core','quintzee_reduce_core','quintzee_ready_timeout')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;END $$;

CREATE OR REPLACE FUNCTION private.quintzee_control_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.auto_fold IS DISTINCT FROM OLD.auto_fold OR NEW.sit_out_next_hand IS DISTINCT FROM OLD.sit_out_next_hand THEN
  UPDATE private.quintzee_matches m SET revision=revision+1
  FROM public.games g WHERE g.id=NEW.game_id AND g.game_type='quintzee'
   AND g.current_game_uuid=m.dealer_game_id AND m.game_id=g.id AND NOT m.finished AND m.settlement IS NULL
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=NEW.id::text);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quintzee_control_changed ON public.players;
CREATE TRIGGER quintzee_control_changed AFTER UPDATE OF auto_fold,sit_out_next_hand ON public.players
 FOR EACH ROW EXECUTE FUNCTION private.quintzee_control_changed();


CREATE OR REPLACE FUNCTION public.quintzee_reclaim(p_dealer_game_id uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.quintzee_matches; g public.games; p public.players; prior text;
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') FOR UPDATE;
 IF NOT FOUND OR NOT private.quintzee_actor_allowed(auth.uid()) OR NOT EXISTS
 (SELECT 1 FROM jsonb_array_elements(m.state->'players') x WHERE x->>'id'=p.id::text) THEN RAISE EXCEPTION 'quintzee:participant_required' USING ERRCODE='42501'; END IF;
 IF g.game_type<>'quintzee' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id
 OR g.status<>'in_progress' OR m.finished OR m.settlement IS NOT NULL THEN RAISE EXCEPTION 'quintzee:inactive'; END IF;
 IF NOT coalesce(p.auto_fold,false) AND NOT coalesce(p.sit_out_next_hand,false) THEN RETURN public.quintzee_snapshot(m.dealer_game_id); END IF;
 IF p_revision IS DISTINCT FROM m.revision THEN RAISE EXCEPTION 'quintzee:stale_revision'; END IF;
 -- Canonical control permission permits clearing intent while paused. No
 -- gameplay mutation, resume, scoring-clock shift or extra action is performed.
 prior:=coalesce(current_setting('app.session_pause_write',true),'');
 PERFORM set_config('app.session_pause_write','on',true);
 UPDATE public.players SET auto_fold=false,sit_out_next_hand=false,auto_play_stop_round_id=NULL WHERE id=p.id;
 PERFORM set_config('app.session_pause_write',prior,true);
 RETURN public.quintzee_snapshot(m.dealer_game_id);
END $$;
REVOKE ALL ON FUNCTION public.quintzee_reclaim(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quintzee_reclaim(uuid,bigint) TO authenticated;


DO $patch$ DECLARE s text;BEGIN
s:=pg_get_functiondef('public.quintzee_snapshot(uuid)'::regprocedure);
s:=replace(s,'private.quintzee_visible(m.state)||jsonb_build_object', $replace$(private.quintzee_visible(m.state)||jsonb_build_object('autoplay',EXISTS(SELECT 1 FROM public.players WHERE id=viewer AND auto_fold)))||jsonb_build_object$replace$);EXECUTE s;
s:=pg_get_functiondef('public.quintzee_action(uuid,uuid,bigint,text,integer[])'::regprocedure);
s:=replace(s,'m.state:=private.quintzee_match_reduce(m.state,p_action,p_items,at_ms);', $replace$IF m.state#>>'{rules,version}'='quintzee/2' AND EXISTS(SELECT 1 FROM public.players WHERE id=player AND auto_fold) THEN RAISE EXCEPTION 'quintzee:reclaim_required';END IF;
 IF m.state->>'phase'='ready' AND (m.state->>'deadline')::bigint<=at_ms THEN PERFORM private.quintzee_ready_timeout(m.dealer_game_id);RETURN public.quintzee_snapshot(m.dealer_game_id);END IF;
 m.state:=private.quintzee_match_reduce(m.state,p_action,p_items,at_ms);$replace$);EXECUTE s;
s:=pg_get_functiondef('private.quintzee_schedule_bot()'::regprocedure);
s:=replace(s,'OR NOT coalesce((NEW.state', $replacement$OR NOT (EXISTS(SELECT 1 FROM public.players WHERE id=(NEW.state->'players'->(NEW.state->>'turnIndex')::int->>'id')::uuid AND auto_fold AND NEW.state#>>'{rules,version}'='quintzee/2') OR coalesce((NEW.state$replacement$);
s:=replace(s,'''isBot'')::boolean,false) THEN','''isBot'')::boolean,false)) THEN');EXECUTE s;
s:=pg_get_functiondef('private.quintzee_recover()'::regprocedure);
s:=replace(s,'OR NOT coalesce((m.state->''players''->(m.state->>''turnIndex'')::integer->>''isBot'')::boolean,false)','');s:=replace(s,'AND is_bot) THEN','AND (is_bot OR auto_fold)) THEN');EXECUTE s;
END $patch$;

DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('private.quintzee_recover()'::regprocedure);s:=replace(s,'EXIT WHEN m.state->>''phase''=''complete'' OR','EXIT WHEN m.state->>''phase'' IN(''complete'',''ready'') OR');EXECUTE s;END $patch$;

REVOKE ALL ON FUNCTION private.quintzee_control_changed() FROM PUBLIC,anon,authenticated,service_role;
