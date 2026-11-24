-- Preserve every feedback row; disclose letters only for a successful final guess.
-- Reader-only change: stored games, scoring, settlement and receipts are untouched.
DO $patch$
DECLARE src text:=pg_get_functiondef('public.delayed_match_record(uuid,uuid)'::regprocedure);
BEGIN
 IF strpos(src,$new$jsonb_build_object('word',CASE WHEN coalesce((r->>'completed')::boolean,false)
                  AND guess_no=jsonb_array_length(r->'guesses') AND guess->>'word'=r->>'answer'
                  THEN guess->>'word' ELSE '' END,'feedback',guess->'feedback')$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$jsonb_build_object('word',CASE WHEN guess_no=1 THEN guess->>'word' ELSE '' END,
                  'feedback',CASE WHEN guess_no=1 AND guess->>'word'<>r->>'answer'
                    THEN '["absent","absent","absent","absent","absent"]'::jsonb ELSE guess->'feedback' END)$old$)=0 THEN RAISE EXCEPTION 'five_alive:unexpected_history_projection';END IF;
 EXECUTE replace(src,$old$jsonb_build_object('word',CASE WHEN guess_no=1 THEN guess->>'word' ELSE '' END,
                  'feedback',CASE WHEN guess_no=1 AND guess->>'word'<>r->>'answer'
                    THEN '["absent","absent","absent","absent","absent"]'::jsonb ELSE guess->'feedback' END)$old$,$new$jsonb_build_object('word',CASE WHEN coalesce((r->>'completed')::boolean,false)
                  AND guess_no=jsonb_array_length(r->'guesses') AND guess->>'word'=r->>'answer'
                  THEN guess->>'word' ELSE '' END,'feedback',guess->'feedback')$new$);
END $patch$;
