-- Observation-only policy: this function receives the exact actor projection.
-- No table reads, deck queries or concealed-card access. Stable tie ordering.
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
 ELSIF (v->>'consecutiveNoRevealTurns')::integer>=4*jsonb_array_length(v->'players') THEN urgency:=0.5;END IF;
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
