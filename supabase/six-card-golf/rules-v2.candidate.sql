-- LOCAL REVIEW CANDIDATE ONLY. No migration applied or release flags changed.
-- /1 remains frozen. Only future admissions choose /2 after explicit publication.
-- Six exposed takes precedence if the triggering draw also completes the actor's tableau.
CREATE OR REPLACE FUNCTION private.golf_rules_v2() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"six-card-golf/2","holes":9,"turnSeconds":30,"openingCards":2,"finalTrigger":"stock_equals_concealed_players","holeResultSeconds":6}'::jsonb
$$;
REVOKE ALL ON FUNCTION private.golf_rules_v2() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.golf_supported_rules(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb:=r->'presentation';BEGIN
 IF r IN (private.golf_rules(),private.golf_rules_v2()) THEN RETURN true;END IF;
 RETURN coalesce(r-'presentation' IN (private.golf_rules(),private.golf_rules_v2()) AND p=jsonb_build_object('version',1,'scoringDelayMs',(p->>'scoringDelayMs')::integer,'resultsDurationMs',(p->>'resultsDurationMs')::integer)
 AND (p->>'scoringDelayMs')::integer BETWEEN 200 AND 5000 AND (p->>'resultsDurationMs')::integer BETWEEN 1000 AND 30000,false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION private.golf_admission_rules() RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules_v2()||jsonb_build_object('presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $$;

CREATE OR REPLACE FUNCTION private.golf_integrity(s jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); cards jsonb; pending_i integer; count_i integer; distinct_i integer; low_i integer; high_i integer;
BEGIN
 IF n NOT BETWEEN 2 AND 4 OR NOT private.golf_supported_rules(s->'rules')
  OR (SELECT count(*) FROM jsonb_object_keys(s->'tableaus'))<>n THEN RAISE EXCEPTION 'golf:integrity';END IF;
 pending_i:=CASE WHEN s->'pending'='null'::jsonb THEN 0 ELSE 1 END;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') p
  WHERE jsonb_array_length(s->'tableaus'->(p->>'id')->'cards') IS DISTINCT FROM 6
   OR jsonb_array_length(s->'tableaus'->(p->>'id')->'exposed') IS DISTINCT FROM 6)
  OR 6*n+jsonb_array_length(s->'stock')+jsonb_array_length(s->'discard')+pending_i<>52
  OR (pending_i=1 AND s#>>'{pending,actor}' IS DISTINCT FROM s->'players'->(s->>'turnIndex')::integer->>'id')
 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 SELECT coalesce(jsonb_agg(c),'[]'::jsonb) INTO cards FROM jsonb_each(s->'tableaus') t CROSS JOIN LATERAL jsonb_array_elements(t.value->'cards') c;
 cards:=cards||(s->'stock')||(s->'discard')||CASE WHEN pending_i=1 THEN jsonb_build_array(s#>'{pending,card}') ELSE '[]'::jsonb END;
 SELECT count(*),count(DISTINCT value::integer),min(value::integer),max(value::integer) INTO count_i,distinct_i,low_i,high_i FROM jsonb_array_elements_text(cards);
 IF count_i<>52 OR distinct_i<>52 OR low_i<>0 OR high_i<>51 THEN RAISE EXCEPTION 'golf:integrity';END IF;
END $$;

CREATE OR REPLACE FUNCTION private.golf_reduce(s jsonb, action text, items integer[], at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); actor_i integer:=(s->>'turnIndex')::integer;
 actor text:=s->'players'->actor_i->>'id'; b jsonb; card jsonb; old_card jsonb; pos integer; exposed_new boolean:=false;
 queue jsonb:=s->'finalQueue'; already_final boolean:=s->>'finalReason' IS NOT NULL;
 next_i integer:=(actor_i+1)%n; count_i integer; i integer; totals jsonb:=s->'scores'; results jsonb:='{}'; p jsonb; score_i integer; remaining integer;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase' NOT IN ('opening','playing') THEN RAISE EXCEPTION 'golf:phase';END IF;
 b:=s->'tableaus'->actor;
 IF s->>'phase'='opening' THEN
  IF action IS DISTINCT FROM 'open' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL
    OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['exposed',items[1]::text],'true'),ARRAY['exposed',items[2]::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);remaining:=(s->>'openingRemaining')::integer-1;
  RETURN s||jsonb_build_object('openingRemaining',remaining,'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
    'turnIndex',next_i,'deadline',at_ms+30000);
 END IF;
 IF action='draw' THEN
  IF s->'pending'<>'null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_draw';END IF;
  IF jsonb_array_length(s->'stock')=0 THEN
   IF jsonb_array_length(s->'discard')<=1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
   s:=s||jsonb_build_object('stock',private.golf_shuffle((s->'discard')-(jsonb_array_length(s->'discard')-1)),'discard',jsonb_build_array(s->'discard'->-1));
  END IF;
  s:=s||jsonb_build_object('pending',jsonb_build_object('actor',actor,'card',s->'stock'->0),'stock',(s->'stock')-0);
  -- Latch on the draw, while its card is pending. The current turn still finishes normally.
  IF s#>>'{rules,version}'='six-card-golf/2' AND NOT already_final
    AND jsonb_array_length(s->'stock')=(SELECT count(*) FROM jsonb_each(s->'tableaus') t
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.value->'exposed') e WHERE NOT e::boolean)) THEN
   s:=s||jsonb_build_object('stockFinalTrigger',actor);
  END IF;
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline.
 ELSIF action='reject' THEN
  IF s->'pending'='null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_reject';END IF;
  s:=s||jsonb_build_object('discard',(s->'discard')||jsonb_build_array(s#>'{pending,card}'),'pending',NULL);
 ELSIF action IN ('replace','discard') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'golf:illegal_position';END IF;
  pos:=items[1];old_card:=b->'cards'->pos;exposed_new:=NOT (b->'exposed'->>pos)::boolean;
  IF action='replace' THEN
   IF s->'pending'='null'::jsonb THEN RAISE EXCEPTION 'golf:pending_required';END IF;
   card:=s#>'{pending,card}';s:=s||jsonb_build_object('pending',NULL);
  ELSE
   IF s->'pending'<>'null'::jsonb OR jsonb_array_length(s->'discard')=0 THEN RAISE EXCEPTION 'golf:illegal_discard';END IF;
   card:=s->'discard'->-1;s:=jsonb_set(s,'{discard}',(s->'discard')-(jsonb_array_length(s->'discard')-1));
  END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['cards',pos::text],card),ARRAY['exposed',pos::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(old_card));
 ELSE RAISE EXCEPTION 'golf:invalid_action';
 END IF;
 count_i:=CASE WHEN s#>>'{rules,version}'='six-card-golf/2' OR exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF s#>>'{rules,version}'='six-card-golf/2' AND s->>'stockFinalTrigger'=actor THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','stock_threshold');
 ELSIF s#>>'{rules,version}'='six-card-golf/1' AND count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=(s-'stockFinalTrigger')||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
 IF already_final AND jsonb_array_length(queue)=0 THEN
  IF s#>'{rules,presentation}' IS NOT NULL THEN s:=s||jsonb_build_object('presentation',private.golf_presentation(s,at_ms));END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=9 THEN 'complete' ELSE 'hole_complete' END,'deadline',coalesce((s#>>'{presentation,endsAt}')::bigint,at_ms+6000));
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.golf_bot_choice(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE actor text:=v->'players'->(v->>'turnIndex')::integer->>'id'; cards jsonb; card integer; i integer; peer integer;
 before_i numeric; after_i numeric; gain numeric; best numeric:=-10000; best_i integer:=0;
 unknown_mean numeric:=71.0/13; urgency numeric:=0; next_cards jsonb; assistance numeric:=0; candidate_action text;
BEGIN
 IF v->>'phase'='opening' THEN RETURN '{"action":"open","items":[0,3]}'::jsonb;END IF;
 IF v->>'phase'<>'playing' THEN RETURN NULL;END IF;
 cards:=v->'tableaus'->actor->'cards';
 card:=CASE WHEN v->'pending'<>'null'::jsonb THEN (v#>>'{pending,card}')::integer ELSE (v->>'discardTop')::integer END;
 candidate_action:=CASE WHEN v->'pending'<>'null'::jsonb THEN 'replace' ELSE 'discard' END;
 -- Public endgame / stalemate pressure and completed-hole standings influence
 -- the value of resolving an unknown. They do not expose its actual value.
 IF v->>'finalReason' IS NOT NULL THEN urgency:=0.75;
 ELSIF v#>>'{rules,version}'='six-card-golf/1' AND (v->>'consecutiveNoRevealTurns')::integer>=4*jsonb_array_length(v->'players') THEN urgency:=0.5;END IF;
 IF (v->'scores'->>actor)::integer>(SELECT min(value::integer) FROM jsonb_each_text(v->'scores')) THEN urgency:=urgency+0.25;END IF;
 next_cards:=v->'tableaus'->(v->'players'->(((v->>'turnIndex')::integer+1)%jsonb_array_length(v->'players'))->>'id')->'cards';
 FOR i IN 0..5 LOOP
  peer:=CASE WHEN i<3 THEN i+3 ELSE i-3 END;
  -- Expected column score uses a uniform unknown rank, never a private card.
  IF cards->>i IS NULL AND cards->>peer IS NULL THEN before_i:=2*unknown_mean*12/13;
  ELSIF cards->>i IS NULL THEN before_i:=unknown_mean+private.golf_points((cards->>peer)::integer)-(2.0/13)*private.golf_points((cards->>peer)::integer);
  ELSIF cards->>peer IS NULL THEN before_i:=unknown_mean+private.golf_points((cards->>i)::integer)-(2.0/13)*private.golf_points((cards->>i)::integer);
  ELSE before_i:=CASE WHEN (cards->>i)::integer%13=(cards->>peer)::integer%13 THEN 0 ELSE private.golf_points((cards->>i)::integer)+private.golf_points((cards->>peer)::integer) END;END IF;
  IF cards->>peer IS NULL THEN after_i:=unknown_mean+private.golf_points(card)-(2.0/13)*private.golf_points(card);
  ELSE after_i:=CASE WHEN card%13=(cards->>peer)::integer%13 THEN 0 ELSE private.golf_points(card)+private.golf_points((cards->>peer)::integer) END;END IF;
  assistance:=CASE WHEN cards->>i IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(next_cards) c WHERE c IS NOT NULL AND c::integer%13=(cards->>i)::integer%13) THEN 0.5 ELSE 0 END;
  gain:=before_i-after_i-assistance+CASE WHEN cards->>i IS NULL THEN urgency ELSE 0 END;
  IF gain>best THEN best:=gain;best_i:=i;END IF;
 END LOOP;
 IF best>0 THEN RETURN jsonb_build_object('action',candidate_action,'items',jsonb_build_array(best_i));END IF;
 RETURN jsonb_build_object('action',CASE WHEN candidate_action='replace' THEN 'reject' ELSE 'draw' END,'items','[]'::jsonb);
END $$;
