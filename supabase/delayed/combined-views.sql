-- Only paired round scores are shared before completion. Never expose a board/deck.
CREATE FUNCTION private.delayed_child_scores(c private.delayed_children) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN c.game_type='ptown-words' THEN c.state->'scores'
 ELSE (WITH participants AS(SELECT value AS actor FROM jsonb_array_elements_text(c.state->'players')),
 paired AS(SELECT min((SELECT count(*) FROM jsonb_array_elements(c.state->'attempts') a WHERE a->>'actor'=p.actor)) n FROM participants p)
 SELECT jsonb_object_agg(p.actor,coalesce((SELECT sum((a->>'score')::bigint) FROM jsonb_array_elements(c.state->'attempts') a
  WHERE a->>'actor'=p.actor AND (c.terminal OR (a->>'round')::integer<=(SELECT n FROM paired))),0)) FROM participants p) END
$$;
REVOKE ALL ON FUNCTION private.delayed_child_scores(private.delayed_children) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE source_i text;BEGIN
 source_i:=pg_get_functiondef('public.delayed_home(uuid)'::regprocedure);
 IF position('''scores'',c.state->''scores''' IN source_i)=0 THEN RAISE EXCEPTION 'delayed:home_source_changed';END IF;
 EXECUTE replace(source_i,'''scores'',c.state->''scores''','''scores'',private.delayed_child_scores(c)');
END $$;
