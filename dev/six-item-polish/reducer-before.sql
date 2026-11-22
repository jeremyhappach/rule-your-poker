CREATE OR REPLACE FUNCTION private.ptown_words_reduce(s jsonb, action text, items jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<reducer>>
DECLARE was_timeout boolean:=action='tick'; board jsonb:=s->'board';old_board jsonb:=board;bag jsonb:=s->'bag';player text:=s->'players'->(s->>'turnIndex')::int->>'id';rack jsonb:=s->'racks'->player;
 used int[]:=ARRAY[]::int[];squares int[]:=ARRAY[]::int[];tile jsonb;item jsonb;cell jsonb;letter text;sq int;i int;j int;k int;r int;c int;dr int;dc int;rr int;cc int;start_r int;start_c int;direction int;seen text[]:=ARRAY[]::text[];key text;word text;words jsonb:='[]';points int:=0;subtotal int;multiplier int;value_i int;premium text;connected boolean:=false;empty_board boolean;rows int[];cols int[];score_before jsonb;deductions jsonb:='{}';deduct int;total_deduct int:=0;person jsonb;went_out boolean:=false;done boolean:=false;count_i int;discard jsonb:='[]';label text;winners jsonb;best int;prebest int;
BEGIN
 IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN RAISE EXCEPTION 'ptown_words:rules';END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'ptown_words:phase';END IF;
 IF action='tick' AND s#>>'{rules,version}'='ptown-words/3' THEN RAISE EXCEPTION 'ptown_words:async_expiry_owner';END IF;
 IF action='tick' THEN IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;action:='pass';
 ELSIF at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'ptown_words:deadline';END IF;
 IF action<>'tick' AND at_ms<coalesce((s#>>'{movePresentation,readyAt}')::bigint,0) THEN RAISE EXCEPTION 'ptown_words:presenting_move';END IF;
 
 IF action='time_bank' THEN
  IF s#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4') THEN RAISE EXCEPTION 'ptown_words:time_bank_unavailable';END IF;
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)<>1 OR jsonb_typeof(items->0->'slot') IS DISTINCT FROM 'number' OR items->0->>'slot' NOT IN ('0','1') THEN RAISE EXCEPTION 'ptown_words:time_bank_slot';END IF;
  i:=(items->0->>'slot')::int;
  IF coalesce(s->'timeBankSpent'->player,'[]'::jsonb) @> jsonb_build_array(i) THEN RAISE EXCEPTION 'ptown_words:time_bank_used';END IF;
  RETURN s||jsonb_build_object('timeBankSpent',coalesce(s->'timeBankSpent','{}'::jsonb)||jsonb_build_object(player,coalesce(s->'timeBankSpent'->player,'[]'::jsonb)||jsonb_build_array(i)),
   'deadline',(s->>'deadline')::bigint+(s#>>'{rules,timeBankMs}')::bigint);
 END IF;
 IF action NOT IN('place','exchange','pass') THEN RAISE EXCEPTION 'ptown_words:invalid_action';END IF;
 IF action IN('place','exchange') THEN
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'ptown_words:invalid_tiles';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF jsonb_typeof(item->'tileId') IS DISTINCT FROM 'number' OR (item->>'tileId') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'ptown_words:tile_id';END IF;
   i:=(item->>'tileId')::int;
   SELECT value INTO tile FROM jsonb_array_elements(rack) WHERE (value->>'id')::int=i;
   IF tile IS NULL OR i=ANY(used) THEN RAISE EXCEPTION 'ptown_words:tile_not_owned';END IF;used:=array_append(used,i);discard:=discard||jsonb_build_array(tile);
   IF action='place' THEN
    IF jsonb_typeof(item->'square') IS DISTINCT FROM 'number' OR (item->>'square') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'ptown_words:square';END IF;
    sq:=(item->>'square')::int;
    IF sq NOT BETWEEN 0 AND 224 OR sq=ANY(squares) OR board->sq IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'ptown_words:occupied_square';END IF;
    letter:=item->>'letter';IF letter IS NULL OR letter !~ '^[A-Z]$' OR (tile->>'face'<>'?' AND letter<>tile->>'face') THEN RAISE EXCEPTION 'ptown_words:blank_letter';END IF;
    squares:=array_append(squares,sq);board:=jsonb_set(board,ARRAY[sq::text],tile||jsonb_build_object('letter',letter,'blank',tile->>'face'='?'));
   END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO rack FROM jsonb_array_elements(rack) WITH ORDINALITY t(value,ordinal) WHERE NOT (value->>'id')::int=ANY(used);
 END IF;
 IF action='place' THEN
  SELECT array_agg(DISTINCT x/15),array_agg(DISTINCT x%15) INTO rows,cols FROM unnest(squares)x;
  IF cardinality(rows)>1 AND cardinality(cols)>1 THEN RAISE EXCEPTION 'ptown_words:one_line';END IF;
  empty_board:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_board)v WHERE v<>'null'::jsonb);
  IF empty_board AND NOT 112=ANY(squares) THEN RAISE EXCEPTION 'ptown_words:cover_center';END IF;
  IF cardinality(rows)=1 THEN FOR i IN (SELECT min(x%15) FROM unnest(squares)x)..(SELECT max(x%15) FROM unnest(squares)x) LOOP IF board->(rows[1]*15+i)='null'::jsonb THEN RAISE EXCEPTION 'ptown_words:gap';END IF;END LOOP;
  ELSE FOR i IN (SELECT min(x/15) FROM unnest(squares)x)..(SELECT max(x/15) FROM unnest(squares)x) LOOP IF board->(i*15+cols[1])='null'::jsonb THEN RAISE EXCEPTION 'ptown_words:gap';END IF;END LOOP;END IF;
  FOREACH sq IN ARRAY squares LOOP
   r:=sq/15;c:=sq%15;
   IF (r>0 AND old_board->(sq-15)<>'null'::jsonb) OR (r<14 AND old_board->(sq+15)<>'null'::jsonb) OR (c>0 AND old_board->(sq-1)<>'null'::jsonb) OR (c<14 AND old_board->(sq+1)<>'null'::jsonb) THEN connected:=true;END IF;
   FOR direction IN 0..1 LOOP
    dr:=direction;dc:=1-direction;rr:=r;cc:=c;
    WHILE rr-dr>=0 AND cc-dc>=0 AND board->((rr-dr)*15+cc-dc)<>'null'::jsonb LOOP rr:=rr-dr;cc:=cc-dc;END LOOP;
    start_r:=rr;start_c:=cc;key:=rr||':'||cc||':'||direction;IF key=ANY(seen) THEN CONTINUE;END IF;seen:=array_append(seen,key);
    word:='';subtotal:=0;multiplier:=1;
    WHILE rr<15 AND cc<15 AND board->(rr*15+cc)<>'null'::jsonb LOOP
     k:=rr*15+cc;cell:=board->k;word:=word||(cell->>'letter');value_i:=(cell->>'value')::int;
     IF k=ANY(squares) THEN premium:=private.ptown_words_premium(k);IF premium='DL' THEN value_i:=value_i*2;ELSIF premium='TL' THEN value_i:=value_i*3;ELSIF premium='DW' THEN multiplier:=multiplier*2;ELSIF premium='TW' THEN multiplier:=multiplier*3;END IF;END IF;
     subtotal:=subtotal+value_i;rr:=rr+dr;cc:=cc+dc;
    END LOOP;
    IF length(word)>1 THEN
     IF NOT EXISTS(SELECT 1 FROM private.ptown_words_lexicon l WHERE l.version=s#>>'{rules,dictionaryId}' AND l.word=reducer.word) THEN RAISE EXCEPTION 'ptown_words:invalid_word:%',word;END IF;
     points:=points+subtotal*multiplier;words:=words||jsonb_build_array(jsonb_build_object('word',word,'points',subtotal*multiplier,'square',start_r*15+start_c,'direction',direction));
    END IF;
   END LOOP;
  END LOOP;
  IF (NOT empty_board AND NOT connected) OR jsonb_array_length(words)=0 THEN RAISE EXCEPTION 'ptown_words:disconnected';END IF;
  IF cardinality(squares)=7 THEN points:=points+50;END IF;
  s:=jsonb_set(s,ARRAY['scores',player],to_jsonb((s->'scores'->>player)::int+points));
  s:=s||jsonb_build_object('board',board,'passes',0);label:=(words->0->>'word');
 ELSIF action='exchange' THEN
  IF jsonb_array_length(bag)<7 THEN RAISE EXCEPTION 'ptown_words:need_seven_in_bag';END IF;
  s:=s||jsonb_build_object('passes',0);label:='Exchanged '||cardinality(used)||' tiles';
 ELSE s:=s||jsonb_build_object('passes',(s->>'passes')::int+1);label:='Passed';END IF;
 IF action IN('place','exchange') THEN
  count_i:=least(7-jsonb_array_length(rack),jsonb_array_length(bag));
  FOR i IN 1..count_i LOOP rack:=rack||jsonb_build_array(bag->0);bag:=bag-0;END LOOP;
  IF action='exchange' THEN bag:=private.ptown_words_shuffle(bag||discard);END IF;
 END IF;
 s:=jsonb_set(s,ARRAY['racks',player],rack)||jsonb_build_object('bag',bag);
 went_out:=action='place' AND jsonb_array_length(bag)=0 AND jsonb_array_length(rack)=0;
 done:=went_out OR (s->>'passes')::int>=2*jsonb_array_length(s->'players');
 s:=s||jsonb_build_object('moves',(s->'moves')||jsonb_build_array(jsonb_build_object('turn',(s->>'turn')::int,'playerId',player,'action',action,'words',words,'count',coalesce(cardinality(used),0),'points',points)||CASE WHEN was_timeout THEN jsonb_build_object('reason','timeout') ELSE '{}'::jsonb END),'event',jsonb_build_object('label',label,'points',points),'turn',(s->>'turn')::int+1);
 IF done THEN
  score_before:=s->'scores';
  FOR person IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   SELECT coalesce(sum((v->>'value')::int),0) INTO deduct FROM jsonb_array_elements(s->'racks'->(person->>'id'))v;
   deductions:=deductions||jsonb_build_object(person->>'id',deduct);total_deduct:=total_deduct+deduct;
   s:=jsonb_set(s,ARRAY['scores',person->>'id'],to_jsonb((s->'scores'->>(person->>'id'))::int-deduct));
  END LOOP;
  IF went_out THEN s:=jsonb_set(s,ARRAY['scores',player],to_jsonb((s->'scores'->>player)::int+total_deduct));END IF;
  SELECT max(value::int) INTO best FROM jsonb_each_text(s->'scores');
  SELECT max((score_before->>x.key)::int) INTO prebest FROM jsonb_each_text(s->'scores')x WHERE x.value::int=best;
  SELECT jsonb_agg(x.key ORDER BY x.key) INTO winners FROM jsonb_each_text(s->'scores')x WHERE x.value::int=best AND (score_before->>x.key)::int=prebest;
  RETURN s||jsonb_build_object('phase','complete','deadline',0,'winnerIds',winners,'preAdjustmentScores',score_before,'rackDeductions',deductions,'endReason',CASE WHEN went_out THEN 'rack_empty' ELSE 'passes' END);
 END IF;
 RETURN s||jsonb_build_object('turnIndex',((s->>'turnIndex')::int+1)%jsonb_array_length(s->'players'),'deadline',at_ms+(s#>>'{rules,turnMs}')::bigint);
END $function$;
