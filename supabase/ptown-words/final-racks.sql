-- Read-only terminal disclosure. No hidden racks enter ordinary snapshots/history.
CREATE OR REPLACE FUNCTION public.ptown_words_final_racks(p_mode text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; revision_i bigint; terminal_i boolean; who uuid:=auth.uid();
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'ptown_words:membership_required' USING ERRCODE='42501'; END IF;
 IF p_mode='live' THEN
  SELECT state,revision,settlement IS NOT NULL INTO s,revision_i,terminal_i
  FROM private.ptown_words_matches WHERE dealer_game_id=p_id;
 ELSIF p_mode='async' THEN
  SELECT state,revision,terminal INTO s,revision_i,terminal_i
  FROM private.delayed_children WHERE id=p_id AND game_type='ptown-words';
 ELSE RAISE EXCEPTION 'ptown_words:invalid_mode'; END IF;
 IF s IS NULL OR NOT EXISTS(SELECT FROM jsonb_array_elements(s->'players') p
  WHERE p->>'userId'=who::text AND NOT coalesce((p->>'isBot')::boolean,false)) THEN
  RAISE EXCEPTION 'ptown_words:membership_required' USING ERRCODE='42501';
 END IF;
 IF NOT coalesce(terminal_i,false) OR (p_mode='live' AND s->>'phase' IS DISTINCT FROM 'complete') THEN
  RAISE EXCEPTION 'ptown_words:game_not_complete' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('id',p_id,'revision',revision_i,'racks',s->'racks',
  'before',coalesce(s->'preAdjustmentScores',s->'scores'),'scores',s->'scores');
END $$;
REVOKE ALL ON FUNCTION public.ptown_words_final_racks(text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ptown_words_final_racks(text,uuid) TO authenticated;
