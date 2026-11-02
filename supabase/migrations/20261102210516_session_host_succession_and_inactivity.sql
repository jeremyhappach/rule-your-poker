-- Local candidate only. No heartbeat, pause, scoring or settlement owner changes.
SET LOCAL lock_timeout='3s';
LOCK TABLE public.games,public.players IN SHARE ROW EXCLUSIVE MODE;
-- Jeremy's rollout rule: exact tenure begins with new tables, after all existing
-- tables finish. Never infer historical reseating times from created_at.
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.games WHERE status NOT IN ('session_ended','completed')) THEN
  RAISE EXCEPTION 'session_membership:finish_existing_tables_before_install';
 END IF;
END $$;
CREATE TABLE private.session_table_tenure (
 player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 seated_since timestamptz,
 missed_dealer_games integer NOT NULL DEFAULT 0 CHECK (missed_dealer_games >= 0)
);
CREATE INDEX session_table_tenure_order ON private.session_table_tenure(game_id,seated_since,player_id);
CREATE TABLE private.session_inactivity_games (
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 dealer_game_id uuid NOT NULL,
 finished boolean NOT NULL DEFAULT false,
 PRIMARY KEY(game_id,dealer_game_id)
);
CREATE TABLE private.session_inactivity_cohort (
 game_id uuid NOT NULL,
 dealer_game_id uuid NOT NULL,
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
 seated_since timestamptz NOT NULL,
 participated boolean NOT NULL,
 PRIMARY KEY(game_id,dealer_game_id,player_id),
 FOREIGN KEY(game_id,dealer_game_id) REFERENCES private.session_inactivity_games ON DELETE CASCADE
);
ALTER TABLE private.session_table_tenure ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.session_inactivity_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.session_inactivity_cohort ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.session_table_tenure,private.session_inactivity_games,private.session_inactivity_cohort FROM PUBLIC,anon,authenticated;

INSERT INTO public.system_settings(key,value) VALUES ('session_inactivity','{"dealer_game_limit":3}') ON CONFLICT(key) DO NOTHING;
ALTER TABLE public.system_settings ADD CONSTRAINT session_inactivity_limit_valid CHECK (
 key <> 'session_inactivity' OR coalesce(
 jsonb_typeof(value->'dealer_game_limit')='number'
 AND (value->>'dealer_game_limit')::numeric BETWEEN 1 AND 2147483647
 AND trunc((value->>'dealer_game_limit')::numeric)=(value->>'dealer_game_limit')::numeric,false));

CREATE FUNCTION private.session_host_eligible(p_game_id uuid,p_user_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game_id AND p.user_id=p_user_id AND NOT p.is_bot AND pr.is_active
 AND p.position IS NOT NULL AND p.status NOT IN ('left','observer'))
$$;
CREATE FUNCTION private.session_longest_tenure_host(p_game_id uuid) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.user_id FROM public.players p JOIN private.session_table_tenure t ON t.player_id=p.id
 JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game_id AND NOT p.is_bot AND pr.is_active AND t.seated_since IS NOT NULL
 AND p.position IS NOT NULL AND p.status NOT IN ('left','observer')
 ORDER BY t.seated_since,p.created_at,p.id LIMIT 1
$$;

CREATE FUNCTION private.track_session_table_tenure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE seated boolean; was_seated boolean; g public.games; since_at timestamptz;
BEGIN
 seated:=NEW.position IS NOT NULL AND NEW.status NOT IN ('left','observer');
 -- Canonical seat swaps temporarily clear position while status stays seated.
 -- Only an actual left/observer transition ends that tenure.
 was_seated:=TG_OP='UPDATE' AND OLD.status NOT IN ('left','observer');
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 INSERT INTO private.session_table_tenure(player_id,game_id,seated_since)
 VALUES(NEW.id,NEW.game_id,CASE WHEN seated THEN clock_timestamp() END)
 ON CONFLICT(player_id) DO UPDATE SET
 seated_since=CASE WHEN NEW.status IN ('left','observer') THEN NULL
 WHEN seated AND (NOT was_seated OR session_table_tenure.seated_since IS NULL) THEN clock_timestamp()
 ELSE session_table_tenure.seated_since END,
 missed_dealer_games=CASE WHEN NEW.status IN ('left','observer') OR NOT was_seated THEN 0 ELSE session_table_tenure.missed_dealer_games END
 RETURNING seated_since INTO since_at;
 -- Actual participation resets the run. A rejoin intent alone does not erase it.
 IF seated AND NOT NEW.sitting_out AND NOT NEW.waiting AND g.status='in_progress' THEN
  UPDATE private.session_table_tenure SET missed_dealer_games=0 WHERE player_id=NEW.id;
  UPDATE private.session_inactivity_cohort SET participated=true
  WHERE game_id=g.id AND dealer_game_id=g.current_game_uuid AND player_id=NEW.id AND seated_since=since_at;
 END IF;
 RETURN NEW;
END $$;
-- AFTER row: the new player exists for the FK and all rows in the statement
-- are visible. Host reconciliation below runs once after the complete statement.
CREATE TRIGGER track_session_table_tenure AFTER INSERT OR UPDATE OF position,status,sitting_out,waiting ON public.players
 FOR EACH ROW EXECUTE FUNCTION private.track_session_table_tenure();

CREATE FUNCTION private.reconcile_session_host_after_players() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session_id uuid;
BEGIN
 IF coalesce(current_setting('ptown.membership_boundary',true),'')='on' THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' THEN
  IF NOT EXISTS(SELECT FROM membership_new n JOIN membership_old o ON o.id=n.id
   WHERE (n.status IN ('left','observer')) IS DISTINCT FROM (o.status IN ('left','observer'))
    OR (o.position IS NULL AND n.position IS NOT NULL)) THEN RETURN NULL; END IF;
 END IF;
 FOR session_id IN SELECT DISTINCT game_id FROM membership_new ORDER BY game_id LOOP
  UPDATE public.games SET current_host=current_host WHERE id=session_id
   AND status NOT IN ('session_ended','completed')
   AND NOT private.session_host_eligible(id,current_host);
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER reconcile_session_host_after_insert AFTER INSERT ON public.players
 REFERENCING NEW TABLE AS membership_new FOR EACH STATEMENT EXECUTE FUNCTION private.reconcile_session_host_after_players();
CREATE TRIGGER reconcile_session_host_after_update AFTER UPDATE ON public.players
 REFERENCING NEW TABLE AS membership_new OLD TABLE AS membership_old FOR EACH STATEMENT EXECUTE FUNCTION private.reconcile_session_host_after_players();
CREATE TRIGGER reconcile_session_host_after_delete AFTER DELETE ON public.players
 REFERENCING OLD TABLE AS membership_new FOR EACH STATEMENT EXECUTE FUNCTION private.reconcile_session_host_after_players();

CREATE FUNCTION private.reconcile_session_host_after_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
  PERFORM 1 FROM public.games g WHERE EXISTS(SELECT FROM public.players p WHERE p.game_id=g.id AND p.user_id=NEW.id)
   AND g.status NOT IN ('session_ended','completed') ORDER BY g.id FOR UPDATE;
  UPDATE public.games g SET current_host=current_host WHERE EXISTS(SELECT FROM public.players p WHERE p.game_id=g.id AND p.user_id=NEW.id)
   AND g.status NOT IN ('session_ended','completed');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reconcile_session_host_after_profile AFTER UPDATE OF is_active ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION private.reconcile_session_host_after_profile();

CREATE OR REPLACE FUNCTION private.guard_and_stamp_session_host() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.host_version:=0; RETURN NEW; END IF;
 IF current_user IN ('anon','authenticated') AND
 ROW(OLD.current_host,OLD.host_version) IS DISTINCT FROM ROW(NEW.current_host,NEW.host_version)
 THEN RAISE EXCEPTION 'session_host:command_required' USING ERRCODE='42501'; END IF;
 NEW.host_version:=OLD.host_version+CASE WHEN OLD.current_host IS DISTINCT FROM NEW.current_host THEN 1 ELSE 0 END;
 RETURN NEW;
END $$;
CREATE FUNCTION private.resolve_and_stamp_session_host() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status NOT IN ('session_ended','completed') THEN
  -- Existing leave/join/recovery owners may suggest a created_at candidate.
  -- If the old host is no longer eligible, always resolve by continuous tenure.
  IF NOT private.session_host_eligible(NEW.id,OLD.current_host)
   OR NOT private.session_host_eligible(NEW.id,NEW.current_host) THEN
   NEW.current_host:=private.session_longest_tenure_host(NEW.id);
  END IF;
 END IF;
 NEW.host_version:=OLD.host_version+CASE WHEN OLD.current_host IS DISTINCT FROM NEW.current_host THEN 1 ELSE 0 END;
 RETURN NEW;
END $$;
CREATE TRIGGER h_session_host_succession BEFORE UPDATE ON public.games
 FOR EACH ROW EXECUTE FUNCTION private.resolve_and_stamp_session_host();

-- Preserve the existing RPCs and Gin replay envelopes; tighten only the two
-- host predicates. Refuse installation if those exact authority seams drift.
DO $$ DECLARE source text; changed text;
BEGIN
 source:=pg_get_functiondef('public.request_session_end(uuid,uuid,bigint)'::regprocedure);
 changed:=replace(source,'coalesce(g.current_host,fallback_host) IS DISTINCT FROM auth.uid()',
  'g.current_host IS DISTINCT FROM auth.uid()');
 IF source=changed THEN RAISE EXCEPTION 'session_membership:end_authority_drift'; END IF;
 EXECUTE changed;
 source:=pg_get_functiondef('public.transfer_session_host(uuid,uuid,bigint)'::regprocedure);
 changed:=replace(source,'IF NOT FOUND OR p.is_bot OR p.position IS NULL OR p.status IN (''left'',''observer'') THEN',
  'IF NOT FOUND OR NOT private.session_host_eligible(g.id,p.user_id) THEN');
 IF source=changed THEN RAISE EXCEPTION 'session_membership:transfer_authority_drift'; END IF;
 EXECUTE changed;
END $$;

CREATE FUNCTION private.session_inactivity_boundary() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE first_open boolean; limit_games integer; prior text; context_before jsonb; evicted integer; allow_bots boolean;
BEGIN
 -- Start only at actual gameplay admission, never at configuration or ante.
 IF NEW.status='in_progress' AND NEW.current_game_uuid IS NOT NULL THEN
  INSERT INTO private.session_inactivity_games(game_id,dealer_game_id)
   VALUES(NEW.id,NEW.current_game_uuid) ON CONFLICT DO NOTHING;
  first_open:=FOUND;
  IF first_open THEN
   INSERT INTO private.session_inactivity_cohort(game_id,dealer_game_id,player_id,seated_since,participated)
   SELECT NEW.id,NEW.current_game_uuid,p.id,t.seated_since,NOT p.sitting_out AND NOT p.waiting
   FROM public.players p JOIN private.session_table_tenure t ON t.player_id=p.id
   WHERE p.game_id=NEW.id AND p.position IS NOT NULL AND p.status NOT IN ('left','observer') AND t.seated_since IS NOT NULL;
   UPDATE private.session_table_tenure t SET missed_dealer_games=0
   FROM private.session_inactivity_cohort c WHERE c.game_id=NEW.id AND c.dealer_game_id=NEW.current_game_uuid
   AND c.player_id=t.player_id AND c.participated;
  END IF;
 END IF;
 -- Only the existing settled continuation can release a seat. The active hand,
 -- terminal presentation, pending stakes and cancelled setups cannot do so.
 IF OLD.status<>'game_over' OR NEW.status NOT IN ('waiting','waiting_for_players','game_selection','configuring','dealer_selection','ante_decision','session_ended')
 OR OLD.current_game_uuid IS NULL OR coalesce(OLD.pot,0)<>0 OR coalesce(NEW.pot,0)<>0 OR OLD.is_paused
 OR NOT EXISTS(SELECT FROM public.game_results WHERE game_id=OLD.id AND dealer_game_id=OLD.current_game_uuid) THEN RETURN NEW; END IF;
 UPDATE private.session_inactivity_games SET finished=true
 WHERE game_id=OLD.id AND dealer_game_id=OLD.current_game_uuid AND NOT finished;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT coalesce((value->>'dealer_game_limit')::integer,3) INTO limit_games FROM public.system_settings WHERE key='session_inactivity';
 limit_games:=coalesce(limit_games,3);
 UPDATE private.session_table_tenure t SET missed_dealer_games=t.missed_dealer_games+1
 FROM private.session_inactivity_cohort c JOIN public.players p ON p.id=c.player_id
 WHERE c.game_id=OLD.id AND c.dealer_game_id=OLD.current_game_uuid AND NOT c.participated
 AND t.player_id=c.player_id AND t.seated_since=c.seated_since AND p.sitting_out
 AND p.position IS NOT NULL AND p.status NOT IN ('left','observer');
 prior:=coalesce(current_setting('ptown.membership_boundary',true),'');
 PERFORM set_config('ptown.membership_boundary','on',true);
 context_before:=private.capture_recovery_context();
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.players p SET status='left',position=NULL,waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,
 auto_ante=false,auto_ante_runback=false,auto_fold=false
 FROM private.session_table_tenure t WHERE t.player_id=p.id AND p.game_id=OLD.id AND p.sitting_out
 AND p.status NOT IN ('left','observer') AND p.position IS NOT NULL AND t.missed_dealer_games>=limit_games;
 GET DIAGNOSTICS evicted=ROW_COUNT;
 PERFORM private.restore_recovery_context(context_before);
 PERFORM set_config('ptown.membership_boundary',prior,true);
 IF evicted>0 AND NEW.status IN ('game_selection','configuring','ante_decision') AND NOT EXISTS(
 SELECT FROM public.players WHERE game_id=NEW.id AND position=NEW.dealer_position AND NOT sitting_out AND status NOT IN ('left','observer')) THEN
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm';
  SELECT position INTO NEW.dealer_position FROM public.players WHERE game_id=NEW.id AND position IS NOT NULL
   AND NOT sitting_out AND status NOT IN ('left','observer') AND (coalesce(allow_bots,false) OR NOT is_bot)
   ORDER BY CASE WHEN position<coalesce(OLD.dealer_position,1) THEN 0 ELSE 1 END,position DESC LIMIT 1;
 END IF;
 RETURN NEW;
END $$;
-- Run before host stamping and existing timer registry/presentation observers.
CREATE TRIGGER a_session_inactivity_boundary BEFORE UPDATE OF status,current_game_uuid ON public.games
 FOR EACH ROW EXECUTE FUNCTION private.session_inactivity_boundary();
REVOKE ALL ON FUNCTION private.session_host_eligible(uuid,uuid),private.session_longest_tenure_host(uuid),
 private.track_session_table_tenure(),private.reconcile_session_host_after_players(),private.reconcile_session_host_after_profile(),
 private.session_inactivity_boundary(),private.resolve_and_stamp_session_host() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
