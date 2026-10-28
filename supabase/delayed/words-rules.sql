-- Shared Words engine: /1 and /2 unchanged; /3 freezes 36-hour turns.
DO $$ BEGIN IF md5(pg_get_functiondef('private.ptown_words_rules_for(text)'::regprocedure))<>'2098bafeca98ab738482d94c87c0318e' THEN RAISE EXCEPTION 'Words preimage changed: ptown_words_rules_for';END IF;
IF md5(pg_get_functiondef('private.ptown_words_deal(jsonb,bigint)'::regprocedure))<>'25faf32ae2c997f1596c08d1f02cff4f' THEN RAISE EXCEPTION 'Words preimage changed: ptown_words_deal';END IF;
IF md5(pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure))<>'2ab908a0bce5a85ea6a00fb816b589d3' THEN RAISE EXCEPTION 'Words preimage changed: ptown_words_reduce';END IF; END $$;
CREATE OR REPLACE FUNCTION private.ptown_words_rules_for(version text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE version WHEN 'ptown-words/1' THEN base WHEN 'ptown-words/2' THEN
 base||'{"version":"ptown-words/2","timeBankUses":2,"timeBankMs":180000}'::jsonb WHEN 'ptown-words/3' THEN base||'{"version":"ptown-words/3","turnMs":129600000,"expiryDisposition":"forfeit"}'::jsonb END
 FROM (SELECT '{"version":"ptown-words/1","dictionaryId":"enable2k/1","dictionarySha256":"d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925","turnMs":180000,"exchangeMinimum":7,"passCycles":2,"bingo":50}'::jsonb base) r
$function$
;
CREATE OR REPLACE FUNCTION private.ptown_words_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE bag jsonb; racks jsonb:='{}';scores jsonb:='{}';p jsonb; rack jsonb; i int;start_i int;draws jsonb:='[]';letter text;best text; tied int[]; candidates int[];
BEGIN
 IF s->'rules' IS DISTINCT FROM private.ptown_words_rules() AND s->'rules' IS DISTINCT FROM private.ptown_words_rules_for('ptown-words/3') THEN RAISE EXCEPTION 'ptown_words:rules';END IF;
 SELECT private.ptown_words_shuffle(jsonb_agg(jsonb_build_object('id',id,'face',face,'value',private.ptown_words_value(face)))) INTO bag FROM (
 SELECT row_number() OVER(ORDER BY dist.letter,n)-1 id,dist.letter face FROM (VALUES('A',9),('B',2),('C',2),('D',4),('E',12),('F',2),('G',3),('H',2),('I',9),('J',1),('K',1),('L',4),('M',2),('N',6),('O',8),('P',2),('Q',1),('R',6),('S',4),('T',6),('U',4),('V',2),('W',2),('X',1),('Y',2),('Z',1),('?',2)) dist(letter,copies) CROSS JOIN LATERAL generate_series(1,copies)n) tiles;
 SELECT array_agg(n) INTO candidates FROM generate_series(0,jsonb_array_length(s->'players')-1)n;
 -- Initial draw determines the starter; blank precedes A. Tied players redraw.
 LOOP
  best:=NULL;tied:=ARRAY[]::int[];bag:=private.ptown_words_shuffle(bag);
  FOR i IN 1..cardinality(candidates) LOOP
   letter:=bag->(i-1)->>'face';draws:=draws||jsonb_build_array(jsonb_build_object('playerId',s->'players'->candidates[i]->>'id','letter',letter));
   IF best IS NULL OR letter COLLATE "C" < best COLLATE "C" THEN best:=letter;tied:=ARRAY[candidates[i]];
   ELSIF letter=best THEN tied:=array_append(tied,candidates[i]);END IF;
  END LOOP;
  EXIT WHEN cardinality(tied)=1;candidates:=tied;
 END LOOP;
 start_i:=tied[1];bag:=private.ptown_words_shuffle(bag);
 FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
  SELECT jsonb_agg(value ORDER BY ordinal) INTO rack FROM jsonb_array_elements(bag) WITH ORDINALITY t(value,ordinal) WHERE ordinal<=7;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO bag FROM jsonb_array_elements(bag) WITH ORDINALITY t(value,ordinal) WHERE ordinal>7;
  racks:=racks||jsonb_build_object(p->>'id',rack);scores:=scores||jsonb_build_object(p->>'id',0);
 END LOOP;
 RETURN s||jsonb_build_object('phase','playing','board',(SELECT jsonb_agg(NULL::text) FROM generate_series(1,225)),'bag',bag,'racks',racks,'scores',scores,'turnIndex',start_i,'turn',1,'passes',0,'deadline',at_ms+(s#>>'{rules,turnMs}')::bigint,'openingDraws',draws,'moves','[]'::jsonb,'event',jsonb_build_object('label','Game started','points',0));
END $function$
;
CREATE OR REPLACE FUNCTION private.ptown_words_reduce(s jsonb, action text, items jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<reducer>>
DECLARE board jsonb:=s->'board';old_board jsonb:=board;bag jsonb:=s->'bag';player text:=s->'players'->(s->>'turnIndex')::int->>'id';rack jsonb:=s->'racks'->player;
 used int[]:=ARRAY[]::int[];squares int[]:=ARRAY[]::int[];tile jsonb;item jsonb;cell jsonb;letter text;sq int;i int;j int;k int;r int;c int;dr int;dc int;rr int;cc int;start_r int;start_c int;direction int;seen text[]:=ARRAY[]::text[];key text;word text;words jsonb:='[]';points int:=0;subtotal int;multiplier int;value_i int;premium text;connected boolean:=false;empty_board boolean;rows int[];cols int[];score_before jsonb;deductions jsonb:='{}';deduct int;total_deduct int:=0;person jsonb;went_out boolean:=false;done boolean:=false;count_i int;discard jsonb:='[]';label text;winners jsonb;best int;prebest int;
BEGIN
 IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN RAISE EXCEPTION 'ptown_words:rules';END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'ptown_words:phase';END IF;
 IF action='tick' AND s#>>'{rules,version}'='ptown-words/3' THEN RAISE EXCEPTION 'ptown_words:async_expiry_owner';END IF;
 IF action='tick' THEN IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;action:='pass';
 ELSIF at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'ptown_words:deadline';END IF;
 IF action<>'tick' AND at_ms<coalesce((s#>>'{movePresentation,readyAt}')::bigint,0) THEN RAISE EXCEPTION 'ptown_words:presenting_move';END IF;
 
 IF action='time_bank' THEN
  IF s#>>'{rules,version}'<>'ptown-words/2' THEN RAISE EXCEPTION 'ptown_words:time_bank_unavailable';END IF;
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
 s:=s||jsonb_build_object('moves',(s->'moves')||jsonb_build_array(jsonb_build_object('turn',(s->>'turn')::int,'playerId',player,'action',action,'words',words,'count',coalesce(cardinality(used),0),'points',points)),'event',jsonb_build_object('label',label,'points',points),'turn',(s->>'turn')::int+1);
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
END $function$
;
