-- Operational rollback: stop NEW bot matches while active matches retain their
-- qualified reducer/recovery/settlement. Do not disable the recovery job.
-- Only these exact bot-admission fragments are reversed, preserving later shared
-- adapter additions (for example Race Poker). Stop on any owner drift.
BEGIN;
DO $$
DECLARE signature text;definition text;original text;condition text;fragment text;
BEGIN
 FOR signature,original,condition IN SELECT * FROM (VALUES
  ('public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)',
   'IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>''isBot'')::boolean) THEN RAISE EXCEPTION ''eleven_up:bots_not_supported'';END IF;',''),
  ('private.megatouch_begin(uuid,uuid)',
   'IF g.game_type=''eleven-up'' AND EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>''isBot'')::boolean) THEN RAISE EXCEPTION ''eleven_up:bots_not_supported'';END IF;','g.game_type=''eleven-up'' AND ')
 ) x(signature,original,condition) LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  fragment:='-- 11 Up bots use canonical consent and the shared reducer.'||chr(10)||
   'IF '||condition||'g.real_money IS DISTINCT FROM false AND EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>''isBot'')::boolean) THEN RAISE EXCEPTION ''eleven_up:bots_fake_money_only'';END IF;';
  IF position(fragment IN definition)>0 THEN EXECUTE replace(definition,fragment,original);
  ELSIF position(original IN definition)=0 THEN RAISE EXCEPTION 'eleven_up:rollback_owner_drift:%',signature;
  END IF;
 END LOOP;
END $$;
COMMIT;
