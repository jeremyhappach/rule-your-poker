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
