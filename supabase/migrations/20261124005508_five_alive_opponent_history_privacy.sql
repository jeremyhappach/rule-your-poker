-- Only the completed-history projection changes. Original state, membership,
-- final scores, receipts, settlement and other games are preserved.
DO $migration$
DECLARE src text:=pg_get_functiondef('public.delayed_match_record(uuid,uuid)'::regprocedure);
 old_fragment text:=$old$'players',c.state#>'{fiveAlive,players}','rounds',c.state#>'{fiveAlive,rounds}')$old$;
 new_fragment text:=$new$'players',c.state#>'{fiveAlive,players}','rounds',(
        SELECT jsonb_agg((
          SELECT coalesce(jsonb_agg(
            CASE WHEN c.state#>>ARRAY['fiveAlive','players',(player_no-1)::text]=who::text THEN r
            ELSE jsonb_set(r,'{guesses}',(
              SELECT coalesce(jsonb_agg(
                CASE WHEN coalesce((r->>'completed')::boolean,false)
                  AND guess_no=jsonb_array_length(r->'guesses') AND guess->>'word'=r->>'answer'
                THEN guess ELSE jsonb_build_object('word','','feedback','[]'::jsonb) END
                ORDER BY guess_no),'[]'::jsonb)
              FROM jsonb_array_elements(r->'guesses') WITH ORDINALITY AS guesses(guess,guess_no)))
            END ORDER BY round_no),'[]'::jsonb)
          FROM jsonb_array_elements(player_rounds) WITH ORDINALITY AS rounds(r,round_no)
        ) ORDER BY player_no)
        FROM jsonb_array_elements(c.state#>'{fiveAlive,rounds}') WITH ORDINALITY AS players(player_rounds,player_no)))$new$;
BEGIN
 IF strpos(src,new_fragment)>0 THEN RETURN; END IF;
 IF md5(src)<>'4287e71e2002c15bcaf0c42c28667063' OR strpos(src,old_fragment)=0
 THEN RAISE EXCEPTION 'five_alive:unexpected_record_definition'; END IF;
 EXECUTE replace(src,old_fragment,new_fragment);
END $migration$;
