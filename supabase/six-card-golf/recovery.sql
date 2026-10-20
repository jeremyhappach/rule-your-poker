CREATE TABLE private.golf_integrity_failures (
 dealer_game_id uuid PRIMARY KEY, revision bigint NOT NULL, detected_at timestamptz NOT NULL DEFAULT clock_timestamp(), code text NOT NULL
);
ALTER TABLE private.golf_integrity_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.golf_integrity_failures FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.golf_schedule_bot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL OR NEW.state->>'phase' NOT IN ('opening','playing')
  OR NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=(NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'id')::uuid AND (p.is_bot OR p.auto_fold) AND p.game_id=NEW.game_id) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_bot_schedule BEFORE INSERT OR UPDATE ON private.golf_matches FOR EACH ROW EXECUTE FUNCTION private.golf_schedule_bot();

CREATE OR REPLACE FUNCTION private.golf_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE work record; m private.golf_matches; g public.games; p public.players; at_ms bigint; count_i integer:=0; choice jsonb; prior jsonb; enabled boolean; policy text;
BEGIN
 prior:=private.capture_recovery_context();
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR work IN SELECT x.dealer_game_id,x.game_id,x.round_id,x.revision FROM private.golf_matches x JOIN public.games live ON live.id=x.game_id
  WHERE NOT x.finished AND NOT live.is_paused AND x.paused_at IS NULL AND live.current_game_uuid=x.dealer_game_id
   AND live.game_type='six-card-golf' AND (x.settlement IS NOT NULL OR x.state->>'phase'='complete'
    OR least((x.state->>'deadline')::bigint,x.bot_due_at)<=floor(extract(epoch FROM clock_timestamp())*1000))
  ORDER BY x.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=work.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=work.game_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=work.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.round_id<>work.round_id OR m.revision<>work.revision OR g.is_paused OR m.paused_at IS NOT NULL
   OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'six-card-golf' THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  BEGIN
   PERFORM private.golf_integrity(m.state);
  EXCEPTION WHEN OTHERS THEN
   INSERT INTO private.golf_integrity_failures(dealer_game_id,revision,code) VALUES(m.dealer_game_id,m.revision,'card_partition')
    ON CONFLICT(dealer_game_id) DO NOTHING;
   PERFORM public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
   CONTINUE;
  END;
  IF m.settlement IS NOT NULL THEN PERFORM private.golf_finish_postgame(m.dealer_game_id);CONTINUE;END IF;
  IF g.status<>'in_progress' THEN CONTINUE;END IF;
  IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);
  ELSIF m.state->>'phase'='hole_complete' THEN PERFORM private.golf_next_hole(m.dealer_game_id,at_ms);
  ELSE
   SELECT * INTO STRICT p FROM public.players WHERE id=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid AND game_id=m.game_id FOR UPDATE;
   IF g.timeout_enforcement_enabled IS NOT NULL AND g.timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll') THEN
    enabled:=g.timeout_enforcement_enabled;policy:=g.timeout_action;
   ELSE SELECT timeout_enforcement_enabled,timeout_action INTO enabled,policy FROM public.game_defaults WHERE game_type='six-card-golf';END IF;
   IF NOT p.is_bot AND (g.real_money OR NOT coalesce(enabled,false) OR policy IS DISTINCT FROM 'auto_fold') THEN
    IF (m.state->>'deadline')::bigint>at_ms THEN CONTINUE;END IF;
    UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms+30000)),revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
    PERFORM public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
   ELSE
    IF NOT p.is_bot AND NOT p.auto_fold THEN
     IF (m.state->>'deadline')::bigint>at_ms THEN CONTINUE;END IF;
     UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p.id;
    END IF;
    -- Renew the unresolved allowance before the all-human pause so explicit
    -- resume has a usable whole turn; no card/queue/counter changes occur.
    IF NOT p.is_bot AND (m.state->>'deadline')::bigint<=at_ms THEN
     m.state:=jsonb_set(m.state,'{deadline}',to_jsonb(at_ms+30000));
     UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
    END IF;
    IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;
    choice:=private.golf_bot_choice(private.golf_visible(m.state,p.id::text));
    m.state:=private.golf_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
    UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
    IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);END IF;
   END IF;
  END IF;
  count_i:=count_i+1;
 END LOOP;
 PERFORM private.restore_recovery_context(prior);
 RETURN count_i;
EXCEPTION WHEN OTHERS THEN PERFORM private.restore_recovery_context(prior);RAISE;
END $$;
