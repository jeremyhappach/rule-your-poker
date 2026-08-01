-- 1. Generic backfill: durable historical maximum per session.
--    Sources: (a) surviving bot player rows, (b) session_events 'bot_added'
--    history, which survives physical deletion of bot player rows.
WITH hist AS (
  SELECT se.game_id,
         MAX(NULLIF((regexp_match(se.event_data->>'bot_username', '^Bot\s+(\d+)'))[1], '')::int) AS hi
  FROM public.session_events se
  WHERE se.event_type = 'bot_added'
  GROUP BY se.game_id
),
live AS (
  SELECT pl.game_id,
         MAX(NULLIF((regexp_match(pr.username, '^Bot\s+(\d+)'))[1], '')::int) AS hi
  FROM public.players pl
  JOIN public.profiles pr ON pr.id = pl.user_id
  WHERE pl.is_bot = true
  GROUP BY pl.game_id
),
merged AS (
  SELECT game_id, MAX(hi) AS hi
  FROM (SELECT * FROM hist UNION ALL SELECT * FROM live) u
  WHERE hi IS NOT NULL
  GROUP BY game_id
)
UPDATE public.games g
   SET bot_alias_seq = GREATEST(COALESCE(g.bot_alias_seq, 0), m.hi)
  FROM merged m
 WHERE m.game_id = g.id
   AND COALESCE(g.bot_alias_seq, 0) < m.hi;

-- 2. Allocator now also seeds from durable bot_added history, never from
--    roster order/count. Kept for legacy callers.
CREATE OR REPLACE FUNCTION public.allocate_bot_alias_number(_game_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _hist_max integer;
  _live_max integer;
  _next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF((regexp_match(se.event_data->>'bot_username', '^Bot\s+(\d+)'))[1], '')::int), 0)
    INTO _hist_max
  FROM public.session_events se
  WHERE se.game_id = _game_id AND se.event_type = 'bot_added';

  SELECT COALESCE(MAX(NULLIF((regexp_match(pr.username, '^Bot\s+(\d+)'))[1], '')::int), 0)
    INTO _live_max
  FROM public.players pl
  JOIN public.profiles pr ON pr.id = pl.user_id
  WHERE pl.game_id = _game_id AND pl.is_bot = true;

  UPDATE public.games
     SET bot_alias_seq = GREATEST(COALESCE(bot_alias_seq, 0), _hist_max, _live_max) + 1
   WHERE id = _game_id
  RETURNING bot_alias_seq INTO _next;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Game % not found', _game_id;
  END IF;

  RETURN _next;
END;
$function$;

-- 3. Single-transaction Add Bot: allocate ordinal + create identity +
--    seat player + record durable history. Any failure rolls the whole
--    thing back, including the counter increment.
CREATE OR REPLACE FUNCTION public.create_session_bot(
  _game_id uuid,
  _bot_id uuid,
  _aggression_level text,
  _position integer,
  _sitting_out boolean DEFAULT false,
  _waiting boolean DEFAULT false,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _next integer;
  _name text;
  _suffix text;
  _player public.players;
BEGIN
  IF EXISTS (SELECT 1 FROM public.players WHERE game_id = _game_id AND position = _position) THEN
    RAISE EXCEPTION 'Seat % is already occupied', _position;
  END IF;

  _next := public.allocate_bot_alias_number(_game_id);
  _name := 'Bot ' || _next::text;
  _suffix := substr(replace(_bot_id::text, '-', ''), 1, 6);

  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = _name) THEN
    _name := _name || '-' || _suffix;
  END IF;

  INSERT INTO public.profiles (id, username, aggression_level)
  VALUES (_bot_id, _name, COALESCE(_aggression_level, 'normal'));

  INSERT INTO public.players (user_id, game_id, position, chips, is_bot, status, sitting_out, waiting)
  VALUES (_bot_id, _game_id, _position, 0, true, 'active', COALESCE(_sitting_out, false), COALESCE(_waiting, false))
  RETURNING * INTO _player;

  INSERT INTO public.session_events (game_id, event_type, event_data, user_id)
  VALUES (
    _game_id,
    'bot_added',
    jsonb_build_object('position', _position, 'bot_username', _name, 'bot_alias_ordinal', _next),
    _actor_user_id
  );

  RETURN jsonb_build_object('player', to_jsonb(_player), 'username', _name, 'ordinal', _next);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_session_bot(uuid, uuid, text, integer, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_bot(uuid, uuid, text, integer, boolean, boolean, uuid) TO service_role;