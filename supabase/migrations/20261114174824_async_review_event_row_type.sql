-- Preserve correction filtering and the existing visibility predicate. A view's
-- composite row type is distinct from the table type accepted by that predicate.
DO $migration$
DECLARE
 source text := pg_get_functiondef('public.delayed_reviews(uuid)'::regprocedure);
 old_call constant text := 'private.delayed_take_two_review_allowed(e,who)';
 new_call constant text := 'private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who)';
BEGIN
 IF position(new_call IN source)>0 THEN RETURN; END IF;
 IF md5(source)<>'5a907ae5475b1a1076eb306d8124027f' THEN
  RAISE EXCEPTION 'async_review_row_type:reader_changed';
 END IF;
 EXECUTE replace(source,old_call,new_call);
END $migration$;
