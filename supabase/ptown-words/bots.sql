-- LOCAL casual policy: SCOWL common 2–5-letter words, target 8 points. Rules remain /1.
CREATE OR REPLACE FUNCTION private.ptown_words_bot_choice(visible jsonb,at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE board jsonb:=visible->'board';rack jsonb:=visible->'rack';version_i text:=visible#>>'{rules,dictionaryId}';
 player text:=visible->>'activePlayerId';simulation jsonb;trial jsonb;best jsonb;best_cost int:=2147483647;cost_i int;tie_i text;best_tie text:='~';
 starts jsonb:='[]';entry jsonb;stack jsonb[];node jsonb;remaining jsonb;placements jsonb;prefix text;first_word text;
 direction_i int;lane int;offset_i int;start_i int;end_i int;step_i int;position_i int;next_i int;sq int;r int;c int;rr int;cc int;
 empties int;distance_i int;anchor boolean;connected boolean;empty_board boolean;face text;letter text;cross_word text;seen text;
 tile jsonb;tile_i int;letter_i int;nodes int:=0;candidates int:=0;score_i int;rack_count int:=jsonb_array_length(rack);
BEGIN
 IF visible?'bag' OR visible?'racks' THEN RAISE EXCEPTION 'ptown_words:bot_private_input';END IF;
 IF visible->>'phase'<>'playing' OR rack_count=0 THEN RETURN jsonb_build_object('action','pass','items',NULL);END IF;
 empty_board:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements(board)b WHERE b<>'null'::jsonb);
 -- Only the public projection is used to construct trial moves. Empty simulated
 -- opponent racks/bag prevent any hidden draw information reaching the policy.
 -- Read event.points only; the real reducer performs the real draw and endgame.
 simulation:=visible||jsonb_build_object('bag','[]'::jsonb,'racks',(SELECT jsonb_object_agg(p->>'id',CASE WHEN p->>'id'=player THEN rack ELSE '[]'::jsonb END) FROM jsonb_array_elements(visible->'players')p));
 FOR direction_i IN 0..1 LOOP
  step_i:=CASE WHEN direction_i=0 THEN 1 ELSE 15 END;
  FOR lane IN 0..14 LOOP FOR offset_i IN 0..14 LOOP
   start_i:=CASE WHEN direction_i=0 THEN lane*15+offset_i ELSE offset_i*15+lane END;
   end_i:=CASE WHEN direction_i=0 THEN lane*15+14 ELSE 210+lane END;
   IF offset_i>0 AND board->(start_i-step_i)<>'null'::jsonb THEN CONTINUE;END IF;
   empties:=0;anchor:=false;distance_i:=0;
   FOR position_i IN offset_i..14 LOOP
    sq:=start_i+(position_i-offset_i)*step_i;r:=sq/15;c:=sq%15;
    IF board->sq='null'::jsonb THEN empties:=empties+1;END IF;
    EXIT WHEN empties>rack_count;
    IF (empty_board AND sq=112) OR (NOT empty_board AND (board->sq<>'null'::jsonb OR
     (r>0 AND board->(sq-15)<>'null'::jsonb) OR (r<14 AND board->(sq+15)<>'null'::jsonb) OR
     (c>0 AND board->(sq-1)<>'null'::jsonb) OR (c<14 AND board->(sq+1)<>'null'::jsonb))) THEN anchor:=true;EXIT;END IF;
    distance_i:=distance_i+1;
   END LOOP;
   IF anchor THEN starts:=starts||jsonb_build_array(jsonb_build_object('start',start_i,'end',end_i,'step',step_i,'distance',distance_i));END IF;
  END LOOP;END LOOP;
 END LOOP;
 <<search>>
 FOR entry IN SELECT value FROM jsonb_array_elements(starts) ORDER BY (value->>'distance')::int,md5((value->>'start')||':'||(value->>'step')||':'||(visible->>'turn')) LOOP
  step_i:=(entry->>'step')::int;end_i:=(entry->>'end')::int;
  stack:=ARRAY[jsonb_build_object('pos',(entry->>'start')::int,'prefix','','rack',rack,'items','[]'::jsonb,'connected',false)];
  WHILE cardinality(stack)>0 LOOP
   node:=stack[cardinality(stack)];stack:=stack[1:cardinality(stack)-1];nodes:=nodes+1;EXIT search WHEN nodes>3000 OR candidates>=24;
   position_i:=(node->>'pos')::int;prefix:=node->>'prefix';remaining:=node->'rack';placements:=node->'items';connected:=(node->>'connected')::boolean;
   SELECT word INTO first_word FROM private.ptown_words_bot_vocabulary WHERE word>=prefix COLLATE "C" AND word<(prefix||'[') COLLATE "C" ORDER BY word LIMIT 1;
   IF first_word IS NULL THEN CONTINUE;END IF;
   IF first_word=prefix AND length(prefix)>1 AND jsonb_array_length(placements)>0 AND connected AND (position_i>end_i OR board->position_i='null'::jsonb) THEN
    BEGIN
     trial:=private.ptown_words_reduce(simulation,'place',placements,at_ms);score_i:=(trial#>>'{event,points}')::int;candidates:=candidates+1;
     -- Every formed word, including cross-words, must be in the familiar subset.
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(trial->'moves'->-1->'words') w WHERE NOT EXISTS(SELECT 1 FROM private.ptown_words_bot_vocabulary k WHERE k.word=w->>'word')) THEN
      cost_i:=abs(score_i-8)*100+length(prefix)*3;
      tie_i:=md5(player||':'||(visible->>'turn')||':'||placements::text);
      IF cost_i<best_cost OR (cost_i=best_cost AND tie_i<best_tie) THEN best_cost:=cost_i;best_tie:=tie_i;best:=jsonb_build_object('action','place','items',placements);END IF;
     END IF;
    EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'ptown_words:%' THEN RAISE;END IF;
    END;
   END IF;
   IF position_i>end_i THEN CONTINUE;END IF;
   next_i:=position_i+step_i;
   IF board->position_i<>'null'::jsonb THEN
    stack:=array_append(stack,node||jsonb_build_object('pos',next_i,'prefix',prefix||(board->position_i->>'letter'),'connected',true));CONTINUE;
   END IF;
   seen:='';r:=position_i/15;c:=position_i%15;
   FOR tile_i IN 0..jsonb_array_length(remaining)-1 LOOP
    tile:=remaining->tile_i;face:=tile->>'face';IF strpos(seen,face)>0 THEN CONTINUE;END IF;seen:=seen||face;
    FOR letter_i IN 0..CASE WHEN face='?' THEN 25 ELSE 0 END LOOP
     letter:=CASE WHEN face='?' THEN chr(65+letter_i) ELSE face END;
     cross_word:=letter;rr:=r-CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=c-CASE WHEN step_i=15 THEN 1 ELSE 0 END;
     WHILE rr>=0 AND cc>=0 AND board->(rr*15+cc)<>'null'::jsonb LOOP cross_word:=(board->(rr*15+cc)->>'letter')||cross_word;rr:=rr-CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=cc-CASE WHEN step_i=15 THEN 1 ELSE 0 END;END LOOP;
     rr:=r+CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=c+CASE WHEN step_i=15 THEN 1 ELSE 0 END;
     WHILE rr<15 AND cc<15 AND board->(rr*15+cc)<>'null'::jsonb LOOP cross_word:=cross_word||(board->(rr*15+cc)->>'letter');rr:=rr+CASE WHEN step_i=1 THEN 1 ELSE 0 END;cc:=cc+CASE WHEN step_i=15 THEN 1 ELSE 0 END;END LOOP;
     IF length(cross_word)>1 AND NOT EXISTS(SELECT 1 FROM private.ptown_words_bot_vocabulary WHERE word=cross_word) THEN CONTINUE;END IF;
     stack:=array_append(stack,jsonb_build_object('pos',next_i,'prefix',prefix||letter,'rack',remaining-tile_i,'items',placements||jsonb_build_array(jsonb_build_object('tileId',(tile->>'id')::int,'square',position_i,'letter',letter)),'connected',connected OR length(cross_word)>1 OR (empty_board AND position_i=112)));
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP search;
 IF best IS NOT NULL THEN RETURN best;END IF;
 -- One exchange attempt before passing prevents a no-word bot recycling forever.
 IF (visible->>'bagCount')::int>=7 AND coalesce((SELECT move->>'action' FROM jsonb_array_elements(visible->'moves') WITH ORDINALITY t(move,seq) WHERE move->>'playerId'=player ORDER BY seq DESC LIMIT 1),'')<>'exchange' THEN
  RETURN jsonb_build_object('action','exchange','items',(SELECT jsonb_agg(jsonb_build_object('tileId',t->'id')) FROM jsonb_array_elements(rack)t));
 END IF;
 RETURN jsonb_build_object('action','pass','items',NULL);
END $$;
REVOKE ALL ON FUNCTION private.ptown_words_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
