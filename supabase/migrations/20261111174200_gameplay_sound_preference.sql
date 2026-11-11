CREATE FUNCTION public.set_gameplay_sound_preference(p_user_id uuid, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 actor uuid := auth.uid();
 saved boolean;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_user_id OR private.account_enabled(actor) IS NOT TRUE THEN
  RAISE EXCEPTION 'sound_preference:not_authorized' USING ERRCODE='42501';
 END IF;
 IF p_enabled IS NULL THEN
  RAISE EXCEPTION 'sound_preference:invalid_value' USING ERRCODE='22004';
 END IF;
 UPDATE public.profiles SET play_sounds=p_enabled WHERE id=actor
  RETURNING play_sounds INTO STRICT saved;
 RETURN saved;
END
$$;
REVOKE ALL ON FUNCTION public.set_gameplay_sound_preference(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_gameplay_sound_preference(uuid,boolean) TO authenticated;
