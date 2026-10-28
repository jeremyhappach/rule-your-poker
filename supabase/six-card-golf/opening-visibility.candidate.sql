-- LOCAL CANDIDATE ONLY. No deployed migration is modified.
CREATE OR REPLACE FUNCTION private.golf_visible(s jsonb, viewer text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE boards jsonb:='{}'; p jsonb; b jsonb; cards jsonb; i integer;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
  b:=s->'tableaus'->(p->>'id');cards:='[]';
  FOR i IN 0..5 LOOP cards:=cards||jsonb_build_array(CASE WHEN (b->'exposed'->>i)::boolean THEN b->'cards'->i ELSE 'null'::jsonb END);END LOOP;
  boards:=boards||jsonb_build_object(p->>'id',jsonb_build_object('cards',cards,'exposed',b->'exposed'));
 END LOOP;
 RETURN jsonb_build_object('identity',s->'identity','rules',s->'rules','players',s->'players','phase',s->'phase',
  'hole',s->'hole','dealerIndex',s->'dealerIndex','turnIndex',s->'turnIndex','openingRemaining',s->'openingRemaining',
  'tableaus',boards,'stockCount',jsonb_array_length(s->'stock'),'discardTop',CASE WHEN s->>'phase'='opening' THEN 'null'::jsonb ELSE s->'discard'->-1 END,
  'pending',CASE WHEN s#>>'{pending,actor}'=viewer THEN s->'pending' ELSE 'null'::jsonb END,
  'hasPending',s->'pending'<>'null'::jsonb,'scores',s->'scores','holes',s->'holes',
  'consecutiveNoRevealTurns',s->'consecutiveNoRevealTurns','finalQueue',s->'finalQueue','finalReason',s->'finalReason',
  'deadline',s->'deadline','startedAt',s->'startedAt','terminal',s->'terminal');
END $$;

