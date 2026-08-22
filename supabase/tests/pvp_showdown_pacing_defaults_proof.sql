BEGIN;

ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS three_five_seven_showdown_delay_ms integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS holm_rabbit_hunt_post_reveal_delay_ms integer NOT NULL DEFAULT 1000;

ALTER TABLE public.game_defaults
  DROP CONSTRAINT IF EXISTS game_defaults_three_five_seven_showdown_delay_ms_range,
  DROP CONSTRAINT IF EXISTS game_defaults_holm_rabbit_hunt_post_reveal_delay_ms_range;

ALTER TABLE public.game_defaults
  ADD CONSTRAINT game_defaults_three_five_seven_showdown_delay_ms_range
    CHECK (three_five_seven_showdown_delay_ms BETWEEN 0 AND 10000),
  ADD CONSTRAINT game_defaults_holm_rabbit_hunt_post_reveal_delay_ms_range
    CHECK (holm_rabbit_hunt_post_reveal_delay_ms BETWEEN 0 AND 10000);

DO $$
DECLARE
  v_357_default text;
  v_holm_default text;
BEGIN
  SELECT pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    INTO v_357_default
    FROM pg_attribute attribute
    JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
   WHERE attribute.attrelid = 'public.game_defaults'::regclass
     AND attribute.attname = 'three_five_seven_showdown_delay_ms';

  SELECT pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    INTO v_holm_default
    FROM pg_attribute attribute
    JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
   WHERE attribute.attrelid = 'public.game_defaults'::regclass
     AND attribute.attname = 'holm_rabbit_hunt_post_reveal_delay_ms';

  IF v_357_default IS DISTINCT FROM '2000' OR v_holm_default IS DISTINCT FROM '1000' THEN
    RAISE EXCEPTION 'presentation pacing defaults are incorrect: 357=%, holm=%',
      v_357_default, v_holm_default;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.game_defaults
     WHERE three_five_seven_showdown_delay_ms IS NULL
        OR holm_rabbit_hunt_post_reveal_delay_ms IS NULL
  ) THEN
    RAISE EXCEPTION 'presentation pacing backfill left a null value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.game_defaults'::regclass
       AND conname = 'game_defaults_three_five_seven_showdown_delay_ms_range'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.game_defaults'::regclass
       AND conname = 'game_defaults_holm_rabbit_hunt_post_reveal_delay_ms_range'
  ) THEN
    RAISE EXCEPTION 'presentation pacing range constraint is missing';
  END IF;
END;
$$;

UPDATE public.game_defaults
   SET three_five_seven_showdown_delay_ms = 0
 WHERE game_type = '3-5-7';
UPDATE public.game_defaults
   SET holm_rabbit_hunt_post_reveal_delay_ms = 10000
 WHERE game_type = 'holm';

DO $$
BEGIN
  BEGIN
    UPDATE public.game_defaults
       SET three_five_seven_showdown_delay_ms = 10001
     WHERE game_type = '3-5-7';
    RAISE EXCEPTION '3-5-7 upper-bound constraint did not reject 10001';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.game_defaults
       SET holm_rabbit_hunt_post_reveal_delay_ms = -1
     WHERE game_type = 'holm';
    RAISE EXCEPTION 'Holm lower-bound constraint did not reject -1';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
