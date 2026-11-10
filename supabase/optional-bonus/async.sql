CREATE OR REPLACE FUNCTION private.optional_bonus_async_actor(game text,cfg jsonb,s jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF game NOT IN('tri-towers','quintzee','boxdrop') OR s->>'round'<>'3' OR coalesce((s->>'completed')::boolean,false) OR nullif(s->'board','null') IS NOT NULL THEN RETURN NULL;END IF;
 RETURN private.optional_bonus_winner(game,cfg,s->'players',s->'totals',s->'attempts');
END $$;
REVOKE ALL ON FUNCTION private.optional_bonus_async_actor(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.optional_bonus_async_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text;
BEGIN
 IF coalesce(OLD.state->>'round','1')<>'3' AND NEW.state->>'round'='3'
    AND EXISTS(SELECT FROM private.delayed_matches WHERE id=NEW.match_id AND real_money) THEN
  actor:=private.optional_bonus_async_actor(NEW.game_type,NEW.config,NEW.state);
  IF actor IS NOT NULL AND actor=NEW.actor::text THEN
   NEW.state:=NEW.state||jsonb_build_object('optionalBonus',jsonb_build_object('actor',actor,'choice','pending'));
  END IF;
 ELSIF NEW.state#>>'{optionalBonus,choice}'='pending' AND nullif(NEW.state->'board','null') IS NOT NULL THEN
  -- Backward-compatible Start from an older client is an explicit Play choice.
  NEW.state:=jsonb_set(NEW.state,'{optionalBonus,choice}','"play"');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.optional_bonus_async_offer() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS optional_bonus_offer ON private.delayed_children;
CREATE TRIGGER optional_bonus_offer BEFORE UPDATE OF state ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.optional_bonus_async_offer();

-- The existing API verifies the JWT. This service-only operation rechecks the
-- stored actor, parent lock, real-money mode, deadlines and replay fingerprint.
CREATE OR REPLACE FUNCTION public.delayed_bonus_choice(p_child uuid,p_actor uuid,p_request uuid,p_revision bigint,p_segment bigint,p_choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;s jsonb;fingerprint jsonb;at_ms bigint;committed jsonb;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_segment IS NULL OR p_choice IS NULL OR p_choice NOT IN('play','skip') THEN RAISE EXCEPTION 'bonus:invalid_command';END IF;
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 r:=public.delayed_load(p_child,p_actor,p_request);s:=r->'state';at_ms:=(r->>'server_at')::bigint;
 fingerprint:=jsonb_build_object('child',p_child,'revision',p_revision,'segment',p_segment,'intent',jsonb_build_object('type','bonus_'||p_choice));
 IF nullif(r->'receipt','null') IS NOT NULL THEN
  IF r#>>'{receipt,child_id}' IS DISTINCT FROM p_child::text OR r#>'{receipt,fingerprint}' IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
  RETURN r;
 END IF;
 IF (r->>'held')::boolean OR (r->>'terminal')::boolean OR r->>'actor' IS DISTINCT FROM p_actor::text
  OR (r->>'revision')::bigint<>p_revision OR (r->>'segment')::bigint<>p_segment THEN RAISE EXCEPTION 'delayed:stale_action';END IF;
 IF at_ms>=floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000) THEN RAISE EXCEPTION 'bonus:deadline';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=(r->>'match_id')::uuid AND real_money AND status='active')
  OR s#>>'{optionalBonus,choice}' IS DISTINCT FROM 'pending' OR s#>>'{optionalBonus,actor}' IS DISTINCT FROM p_actor::text
  OR private.optional_bonus_async_actor(r->>'game_type',r->'config',s) IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'bonus:not_eligible' USING ERRCODE='42501';END IF;
 s:=jsonb_set(s,'{optionalBonus,choice}',to_jsonb(p_choice));
 IF p_choice='skip' THEN s:=s||jsonb_build_object('completed',true,'winner',p_actor);END IF;
 -- Existing commit owns immutable outcome, actual finances, notices and archival.
 -- Play preserves segment/availability/deadline. Skip adds no synthetic attempt.
 committed:=public.delayed_commit(p_child,p_actor,p_revision,s,'action',at_ms,p_choice='skip',p_request,fingerprint);
 IF committed->>'outcome' NOT IN('committed','duplicate') THEN RAISE EXCEPTION 'delayed:stale_action';END IF;
 RETURN committed->'record';
END $$;
REVOKE ALL ON FUNCTION public.delayed_bonus_choice(uuid,uuid,uuid,bigint,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_bonus_choice(uuid,uuid,uuid,bigint,bigint,text) TO service_role;

-- Keep the legacy projection byte-shape stable for already installed clients.
-- The new API uses this wrapper for both commands and subsequent refreshes.
CREATE OR REPLACE FUNCTION public.delayed_tri_bonus_step(p_child uuid,p_actor uuid,p_request uuid DEFAULT NULL,p_revision bigint DEFAULT NULL,p_segment bigint DEFAULT NULL,p_intent jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;decision jsonb;
BEGIN
 v:=public.delayed_tri_step(p_child,p_actor,p_request,p_revision,p_segment,p_intent);
 SELECT state->'optionalBonus' INTO decision FROM private.delayed_children WHERE id=p_child;
 RETURN v||CASE WHEN decision IS NOT NULL AND (decision->>'actor'=p_actor::text OR (v->>'terminal')::boolean) THEN jsonb_build_object('optionalBonus',decision) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION public.delayed_tri_bonus_step(uuid,uuid,uuid,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_tri_bonus_step(uuid,uuid,uuid,bigint,bigint,jsonb) TO service_role;
