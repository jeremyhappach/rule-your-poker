-- Favor delivery for async alerts. Leave live-table foreground suppression in place.
-- Replace only the presence predicate in the installed, verified function bodies.
DO $migration$
DECLARE
  target regprocedure;
  source text;
  old_guard constant text := 'e.kind<>''registration'' AND private.push_user_active(e.user_id)';
  new_guard constant text := 'e.kind=''table_open'' AND private.push_user_active(e.user_id)';
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.async_push_claim()'::regprocedure,
    'public.async_push_authorize(uuid,uuid,uuid)'::regprocedure
  ] LOOP
    source := pg_get_functiondef(target);
    IF strpos(source,new_guard)>0 AND strpos(source,old_guard)=0 THEN CONTINUE; END IF;
    IF length(source)-length(replace(source,old_guard,''))<>length(old_guard) THEN
      RAISE EXCEPTION 'Unexpected push presence guard in %',target;
    END IF;
    EXECUTE replace(source,old_guard,new_guard);
  END LOOP;
END $migration$;
