-- 11 Up bots: fake money only; unchanged rules, consent and finances.
BEGIN;
DO $preflight$ BEGIN
 IF position('create_session_bot:fake_money_only' IN pg_get_functiondef('public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid)'::regprocedure))=0 THEN RAISE EXCEPTION 'eleven_up:canonical_bot_policy_drift';END IF;
END $preflight$;
-- Candidate only: apply transactionally after qualification and separate release approval.
-- Decisions receive only the same projection available to a player. The existing
-- versioned reducer remains the sole owner of legality, scoring and deadlines.
CREATE OR REPLACE FUNCTION private.eleven_up_bot_choice(visible jsonb,at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE paths jsonb:='{"0":[]}';ball integer;value_i integer;total integer;
BEGIN
 IF visible->>'phase' NOT IN('ready','playing') OR at_ms>=(visible->>'deadline')::bigint THEN RETURN NULL;END IF;
 FOR ball IN
  SELECT (visible->'slots'->slot)::integer FROM jsonb_array_elements_text(visible->'exposed') x(slot_text)
   CROSS JOIN LATERAL (SELECT slot_text::integer slot) p
  UNION ALL SELECT (visible->>'current')::integer WHERE visible->'current'<>'null'::jsonb
 LOOP
  value_i:=private.eleven_up_value(ball);
  -- Descending sums ensure each visible ball is used at most once.
  FOR total IN REVERSE 11..value_i LOOP
   IF NOT paths ? total::text AND paths ? (total-value_i)::text THEN
    paths:=paths||jsonb_build_object(total::text,(paths->(total-value_i)::text)||jsonb_build_array(ball));
   END IF;
  END LOOP;
  IF paths ? '11' THEN RETURN jsonb_build_object('action','group','items',paths->'11');END IF;
 END LOOP;
 IF (visible->>'canPass')::boolean THEN RETURN jsonb_build_object('action','pass');END IF;
 IF visible->>'phase'='playing' THEN RETURN jsonb_build_object('action','take_score');END IF;
 RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION private.eleven_up_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE private.eleven_up_matches ADD COLUMN IF NOT EXISTS bot_due_at bigint;
CREATE INDEX IF NOT EXISTS eleven_up_matches_bot_due ON private.eleven_up_matches
 (least((state->>'deadline')::bigint,bot_due_at),dealer_game_id)
 WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL;

-- Remove only the two explicit bot exclusions. Keep all current shared adapters,
-- canonical consent, stakes, player counts, rules versions and replay guards.
DO $$
DECLARE signature text;definition text;guard text;
BEGIN
 FOR signature,guard IN SELECT * FROM (VALUES
  ('public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)',
   'IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>''isBot'')::boolean) THEN RAISE EXCEPTION ''eleven_up:bots_not_supported'';END IF;'),
  ('private.megatouch_begin(uuid,uuid)',
   'IF g.game_type=''eleven-up'' AND EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>''isBot'')::boolean) THEN RAISE EXCEPTION ''eleven_up:bots_not_supported'';END IF;')
 ) x(signature,guard) LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF position(guard IN definition)>0 THEN
   EXECUTE replace(definition,guard,'-- 11 Up bots use canonical consent and the shared reducer.');
  ELSIF position('-- 11 Up bots use canonical consent and the shared reducer.' IN definition)=0 THEN
   RAISE EXCEPTION 'eleven_up:bots_owner_drift:%',signature;
  END IF;
 END LOOP;
END $$;

-- Canonical create_session_bot is fake-money-only. Do not widen that financial
-- admission policy through direct setup or the shared ante adapter.
DO $$
DECLARE signature text;definition text;condition text;
BEGIN
 FOR signature,condition IN SELECT * FROM (VALUES
  ('public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)',''),
  ('private.megatouch_begin(uuid,uuid)','g.game_type=''eleven-up'' AND ')
 ) x(signature,condition) LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF position('eleven_up:bots_fake_money_only' IN definition)=0 THEN
   IF position('-- 11 Up bots use canonical consent and the shared reducer.' IN definition)=0 THEN
    RAISE EXCEPTION 'eleven_up:bots_owner_drift:%',signature;
   END IF;
   EXECUTE replace(definition,'-- 11 Up bots use canonical consent and the shared reducer.',
    '-- 11 Up bots use canonical consent and the shared reducer.'||chr(10)||
    'IF '||condition||'g.real_money IS DISTINCT FROM false AND EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>''isBot'')::boolean) THEN RAISE EXCEPTION ''eleven_up:bots_fake_money_only'';END IF;');
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.eleven_up_schedule_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
  OR NEW.state->>'phase' NOT IN ('ready','playing')
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN
  NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.eleven_up_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.eleven_up_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.eleven_up_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.status='in_progress' AND live.game_type='eleven-up'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   FOR i IN 1..64 LOOP
 EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
 m.state:=private.eleven_up_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
 END LOOP;
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.eleven_up_bot_choice(private.eleven_up_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.eleven_up_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
  END IF;
  UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.eleven_up_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;
DROP TRIGGER IF EXISTS eleven_up_bot_schedule ON private.eleven_up_matches;
CREATE TRIGGER eleven_up_bot_schedule BEFORE INSERT OR UPDATE ON private.eleven_up_matches FOR EACH ROW EXECUTE FUNCTION private.eleven_up_schedule_bot();
REVOKE ALL ON FUNCTION private.eleven_up_schedule_bot(),private.eleven_up_recover() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
