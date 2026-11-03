-- Local release candidate. Install before the matching client; no table,
-- deadline, recovery, notification, action or financial authority changes.
CREATE OR REPLACE FUNCTION public.delayed_words_inspect(p_child uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE who uuid := auth.uid();
BEGIN
  PERFORM private.delayed_actor(who);
  -- The existing projection enforces participant membership, game identity,
  -- acceptance/removal and private-rack masking. Unlike snapshot(), this path
  -- never calls health recovery, expiry, turn admission or command replay.
  RETURN private.delayed_words_view(p_child, who);
END;
$$;
REVOKE ALL ON FUNCTION public.delayed_words_inspect(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delayed_words_inspect(uuid) TO authenticated;
