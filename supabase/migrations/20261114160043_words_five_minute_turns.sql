-- New admissions use five-minute turns. Frozen /1, /2 and /3 stay unchanged.
-- Existing RPC owners, grants, scoring, settlement, bank sizes and availability remain intact.

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.ptown_words_host_changed()'::regprocedure)) NOT IN ('c2513c7178e6cc0edbec207d75c09788','dbb714eda892025a90b8f19bfe286076') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.ptown_words_host_changed';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.ptown_words_host_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 UPDATE private.ptown_words_matches SET state=state-'pauseRequest',revision=revision+1
 WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished AND state#>>'{rules,version}' IN ('ptown-words/2','ptown-words/4');
 RETURN NEW;
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.ptown_words_rules_for(text)'::regprocedure)) NOT IN ('ec1cab41bea767a53999265188edb293','4cb056a1d1a673d0aa76d12b0e6dc09f') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.ptown_words_rules_for';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.ptown_words_rules_for(version text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE version WHEN 'ptown-words/1' THEN base WHEN 'ptown-words/2' THEN
 base||'{"version":"ptown-words/2","timeBankUses":2,"timeBankMs":180000}'::jsonb WHEN 'ptown-words/3' THEN base||'{"version":"ptown-words/3","turnMs":129600000,"expiryDisposition":"forfeit"}'::jsonb WHEN 'ptown-words/4' THEN base||'{"version":"ptown-words/4","turnMs":300000,"timeBankUses":2,"timeBankMs":180000}'::jsonb END
 FROM (SELECT '{"version":"ptown-words/1","dictionaryId":"enable2k/1","dictionarySha256":"d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925","turnMs":180000,"exchangeMinimum":7,"passCycles":2,"bingo":50}'::jsonb base) r
$function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.ptown_words_deal(jsonb, bigint)'::regprocedure)) NOT IN ('b05cdd580147f0b8235296d1717387fb','ee158eb4487b6667e817750d382de838') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.ptown_words_deal';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.ptown_words_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE bag jsonb; racks jsonb:='{}';scores jsonb:='{}';p jsonb; rack jsonb; i int;start_i int;draws jsonb:='[]';letter text;best text; tied int[]; candidates int[];
BEGIN
 IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN RAISE EXCEPTION 'ptown_words:rules';END IF;
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

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.ptown_words_rules()'::regprocedure)) NOT IN ('294aec382eb506a7909e088946630e7f','ea903c15d360e2ff1b012b21aa05505e') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.ptown_words_rules';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.ptown_words_rules()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ SELECT private.ptown_words_rules_for('ptown-words/4') $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.ptown_words_reduce(jsonb, text, jsonb, bigint)'::regprocedure)) NOT IN ('dcbe38665cc0ec67a7b5fd21e8cc7fb7','a9cbdb85aa90bf8175a569be53138111') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.ptown_words_reduce';
 END IF;
END $guard$;
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
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.chess_prior_delayed_capabilities()'::regprocedure)) NOT IN ('75a9d29f03aa230b85ed9b6f671d3984','fbf2b8803f4a96eab5ba7db70aaa6202') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.chess_prior_delayed_capabilities';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.chess_prior_delayed_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',NOT coalesce((SELECT real_qualified FROM private.delayed_release WHERE singleton),false),'max_children',CASE WHEN private.delayed_multi_enabled() THEN 32 ELSE 1 END,'games',CASE WHEN NOT private.delayed_multi_enabled() THEN jsonb_build_array(jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules())) ELSE jsonb_build_array(
 jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules()),
 jsonb_build_object('id','run21','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='run21'),'rules',(SELECT config FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21')),
 jsonb_build_object('id','tri-towers','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='tri-towers'),'rules',private.tri_towers_rules()),
 jsonb_build_object('id','quintzee','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='quintzee'),'rules',private.quintzee_default_rules()),
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR (private.mega_test_actor(auth.uid()) AND EXISTS(SELECT FROM private.mega_test_async WHERE actor=auth.uid() AND expires_at>statement_timestamp() AND match_id IS NULL)) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END
 ||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release WHERE singleton)
 THEN jsonb_build_array(jsonb_build_object('id','take-two','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='take-two'),'rules',private.take_two_rules('take-two/2')))
 ELSE '[]'::jsonb END ||coalesce((SELECT jsonb_agg(jsonb_build_object('id',game,'stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type=r.game),'rules',private.originals_config(game,game='crib-lab'),'realQualified',async_real_qualified)) FROM private.originals_release r WHERE async_enabled),'[]'::jsonb) END) WHERE auth.uid() IS NOT NULL
$function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.delayed_expire(uuid, bigint, timestamp with time zone)'::regprocedure)) NOT IN ('a0ece6fcbf10e2884cd5c557f3ae0840','a0dd02431e2127280b74f372432f8615') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.delayed_expire';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.delayed_expire(child uuid, expected_segment bigint, expected_expiry timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 -- An entered live-rules Words turn is governed solely by its playable deadline.
 IF c.game_type='ptown-words' AND c.config->>'version' IN ('ptown-words/2','ptown-words/4') AND c.gameplay_due_at IS NOT NULL THEN
  IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment
     OR c.expires_at IS DISTINCT FROM expected_expiry OR clock_timestamp()<c.gameplay_due_at THEN RETURN false; END IF;
  PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'tick',NULL,(c.state->>'deadline')::bigint),clock_timestamp());
  RETURN true;
 END IF;
 IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment OR c.expires_at IS DISTINCT FROM expected_expiry
  OR c.expires_at IS NULL OR clock_timestamp()<c.expires_at THEN RETURN false; END IF;
 -- An earlier active-game deadline must be resolved by the game adapter first.
 IF c.gameplay_due_at IS NOT NULL AND c.gameplay_due_at<c.expires_at THEN RETURN false; END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',CASE WHEN c.actor=m.organizer THEN m.opponent ELSE m.organizer END,
  jsonb_build_object('segment',c.segment,'expiredAt',c.expires_at,'actor',c.actor));
 RETURN true;
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.delayed_words_view(uuid, uuid)'::regprocedure)) NOT IN ('86a206d39855bf9c84442a18d11e109f','e4c3201517f4f0b6e9ec0962d1b40cca') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:private.delayed_words_view';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.delayed_words_view(child uuid, viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;receipt private.delayed_settlements;s jsonb;held boolean;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) OR viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent) OR m.status NOT IN('active','settled') OR c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM private.delayed_outcomes WHERE child_id=c.id;
 SELECT * INTO receipt FROM private.delayed_settlements WHERE match_id=m.id;
 held:=private.delayed_held(m.id);
 s:=private.ptown_words_visible(c.state,viewer::text);
 IF c.config->>'version' IN ('ptown-words/2','ptown-words/4') THEN
  s:=s||jsonb_build_object('playDeadline',floor(extract(epoch FROM c.gameplay_due_at)*1000),'availabilityDeadline',floor(extract(epoch FROM c.expires_at)*1000));
  IF c.gameplay_due_at IS NOT NULL AND viewer=c.actor THEN s:=s-'movePresentation';END IF;
 END IF;
 RETURN s||jsonb_build_object('identity',jsonb_build_object('sessionId',m.id,'dealerGameId',c.id,'roundId',c.id),
 'revision',c.revision,'viewerId',viewer,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
 'deadline',floor(extract(epoch FROM coalesce(c.gameplay_due_at,c.expires_at))*1000),'lastCallAt',floor(extract(epoch FROM c.last_call_at)*1000),
 'canAct',NOT c.terminal AND NOT held AND c.actor=viewer,'paused',held,'pausedAt',NULL,'finished',c.terminal,
 'phase',CASE WHEN c.terminal THEN 'complete' ELSE 'playing' END,'settlement',CASE WHEN receipt.match_id IS NOT NULL THEN jsonb_build_object(m.organizer::text,receipt.organizer_delta,m.opponent::text,receipt.opponent_delta) END,
 'outcome',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'delta',CASE WHEN viewer=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END,
 'terminal',CASE WHEN c.terminal THEN jsonb_build_object('resultId',receipt.result_id,'winnerIds',CASE WHEN o.winner IS NULL THEN jsonb_build_array(m.organizer,m.opponent) ELSE jsonb_build_array(o.winner) END,'score',(SELECT max(value::int) FROM jsonb_each_text(c.state->'scores')),'startedAt',floor(extract(epoch FROM o.completed_at)*1000),'deadline',floor(extract(epoch FROM o.completed_at)*1000)) END,
 'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',receipt.result_id,'batch',NULL));
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.delayed_words_action(uuid, uuid, bigint, text, jsonb)'::regprocedure)) NOT IN ('444105379b5a7efc6b79e2157ff0152f','e08458f21c705a50248e4e1484027468') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:public.delayed_words_action';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_words_action(p_child uuid, p_request uuid, p_revision bigint, p_action text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE who uuid:=auth.uid();c private.delayed_children;m private.delayed_matches;prior private.delayed_word_commands;
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'action',p_action,'items',p_items);s jsonb;answer jsonb;at_time timestamptz;at_ms bigint;winner uuid;rejection text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO prior FROM private.delayed_word_commands WHERE actor=who AND request_id=p_request;
 IF FOUND THEN IF prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;RETURN prior.response;END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000);
 IF NOT c.terminal AND NOT private.delayed_held(m.id) AND at_time>=coalesce(c.gameplay_due_at,c.expires_at) THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:deadline');
 ELSIF c.terminal THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:terminal');
 ELSE
  IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:on_hold';END IF;
  IF c.actor IS DISTINCT FROM who THEN RAISE EXCEPTION 'delayed:not_your_turn' USING ERRCODE='42501';END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'delayed:stale_revision';END IF;
  IF p_action IS NULL OR (p_action NOT IN('place','pass','exchange') AND NOT(c.config->>'version' IN ('ptown-words/2','ptown-words/4') AND p_action IN('begin_turn','time_bank'))) OR (p_action='pass' AND p_items IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_action';END IF;
  IF p_action='begin_turn' THEN
   IF p_items IS NOT NULL THEN RAISE EXCEPTION 'delayed:invalid_action'; END IF;
   IF c.gameplay_due_at IS NULL THEN
    IF at_ms<coalesce((c.state#>>'{movePresentation,readyAt}')::bigint,0) THEN RAISE EXCEPTION 'delayed:presenting_move'; END IF;
    s:=jsonb_set(c.state,'{deadline}',to_jsonb(at_ms+(c.config->>'turnMs')::bigint));
    UPDATE private.delayed_children SET state=s,revision=revision+1,started_at=at_time,gameplay_due_at=to_timestamp((s->>'deadline')::bigint/1000.0) WHERE id=c.id;
    UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
    PERFORM private.delayed_notify(m.id);
   END IF;
   answer:=private.delayed_words_view(c.id,who);
  ELSE
  IF c.config->>'version' IN ('ptown-words/2','ptown-words/4') AND c.gameplay_due_at IS NULL THEN RAISE EXCEPTION 'delayed:enter_turn_first';END IF;
  BEGIN s:=private.ptown_words_reduce(c.state,p_action,p_items,at_ms);
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS rejection=MESSAGE_TEXT;END;
  IF rejection IS NOT NULL THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error',rejection);
  ELSE
   IF p_action='time_bank' THEN
    UPDATE private.delayed_children SET state=s,revision=revision+1,gameplay_due_at=to_timestamp((s->>'deadline')::bigint/1000.0) WHERE id=c.id;
    UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
    PERFORM private.delayed_notify(m.id);
   ELSE PERFORM private.delayed_words_finish_turn(c,s,at_time); END IF;
   answer:=private.delayed_words_view(c.id,who);
  END IF;
  END IF;
 END IF;
 INSERT INTO private.delayed_word_commands VALUES(who,p_request,p_child,fingerprint,answer);
 RETURN answer;
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.ptown_words_snapshot(uuid)'::regprocedure)) NOT IN ('d268c9183ff94323e4744f41168387e5','f7d5cbe05df1c5a6ce38e1cd5b2c6568') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:public.ptown_words_snapshot';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.ptown_words_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.ptown_words_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.ptown_words_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.ptown_words_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'ptown_words:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='ptown_words_terminal';
 RETURN private.ptown_words_visible(m.state,viewer::text)||CASE WHEN m.state#>>'{rules,version}' IN ('ptown-words/2','ptown-words/4') THEN (SELECT jsonb_build_object('hostUserId',current_host,'pauseVersion',pause_version) FROM public.games WHERE id=m.game_id) ELSE '{}'::jsonb END||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.ptown_words_action(uuid, uuid, bigint, text, jsonb)'::regprocedure)) NOT IN ('de1338e4c686d319bc70692c921867da','3ae4bcc6aeb3537e10f65680b0ef99a0') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:public.ptown_words_action';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.ptown_words_action(p_dealer_game_id uuid, p_request_id uuid, p_revision bigint, p_action text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.ptown_words_matches;g public.games;actor uuid:=auth.uid();player uuid;prior private.ptown_words_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items);at_ms bigint;answer jsonb;rejection text;
BEGIN
 SELECT * INTO STRICT m FROM private.ptown_words_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.ptown_words_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 IF player IS NULL OR NOT private.ptown_words_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players')p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'ptown_words:participant_required' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN('place','pass','exchange','time_bank','request_pause','cancel_pause_request') OR pg_column_size(command)>8192 THEN RAISE EXCEPTION 'ptown_words:invalid_command';END IF;
 SELECT * INTO prior FROM private.ptown_words_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'ptown_words:replay_conflict';END IF;IF p_action='cancel_pause_request' THEN RETURN public.ptown_words_snapshot(m.dealer_game_id);END IF;RETURN prior.response;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'ptown-words' OR g.status<>'in_progress' OR m.finished OR (g.is_paused AND p_action<>'cancel_pause_request') THEN RAISE EXCEPTION 'ptown_words:inactive';END IF;
 
 IF p_action='cancel_pause_request' THEN
  IF m.state#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4') OR actor=g.current_host OR m.state->>'phase'<>'playing' THEN RAISE EXCEPTION 'ptown_words:cancel_request_unavailable';END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ptown_words:cancel_request_target';END IF;
  IF jsonb_array_length(p_items)<>1 OR jsonb_typeof(p_items->0->'requestId') IS DISTINCT FROM 'string' OR (p_items->0->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'ptown_words:cancel_request_target';END IF;
  IF m.state ? 'pauseRequest' THEN
   IF m.state#>>'{pauseRequest,playerId}' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'ptown_words:pause_request_owner_required' USING ERRCODE='42501';END IF;
   IF (m.state#>>'{pauseRequest,id}')::uuid IS DISTINCT FROM (p_items->0->>'requestId')::uuid THEN RAISE EXCEPTION 'ptown_words:stale_pause_request';END IF;
   IF g.is_paused THEN RAISE EXCEPTION 'ptown_words:inactive';END IF;
   IF m.revision<>p_revision THEN RAISE EXCEPTION 'ptown_words:stale_revision';END IF;
   UPDATE private.ptown_words_matches SET state=state-'pauseRequest',revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  END IF;
  -- An absent request is already withdrawn (including when host pause won).
  -- Never call set_game_paused or change clocks, turn, rack or financial state.
  answer:=public.ptown_words_snapshot(m.dealer_game_id);
  INSERT INTO private.ptown_words_requests(dealer_game_id,request_id,actor,command,response) VALUES(m.dealer_game_id,p_request_id,actor,command,answer);
  RETURN answer;
 END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'ptown_words:stale_revision';END IF;
 
 IF p_action='request_pause' THEN
  IF m.state#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4') OR actor=g.current_host OR p_items IS NOT NULL OR m.state->>'phase'<>'playing' THEN RAISE EXCEPTION 'ptown_words:pause_request_unavailable';END IF;
  -- One request per canonical pause/host episode. A retry does not create a
  -- second notice or alter the deadline. The pending notice survives reconnect.
  IF NOT (m.state ? 'pauseRequest') THEN
   m.state:=m.state||jsonb_build_object('pauseRequest',jsonb_build_object('id',p_request_id,'playerId',player,'hostUserId',g.current_host,'pauseVersion',g.pause_version));
   UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  END IF;
  answer:=public.ptown_words_snapshot(m.dealer_game_id);
  INSERT INTO private.ptown_words_requests(dealer_game_id,request_id,actor,command,response) VALUES(m.dealer_game_id,p_request_id,actor,command,answer);
  RETURN answer;
 END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::int->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'ptown_words:not_your_turn' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF at_ms<m.last_request_at+400 THEN RAISE EXCEPTION 'ptown_words:rate_limited';END IF;
 BEGIN m.state:=private.ptown_words_reduce(m.state,p_action,p_items,at_ms);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'ptown_words:%' THEN RAISE;END IF;rejection:=SQLERRM;
 END;
 IF rejection IS NOT NULL THEN
  answer:=jsonb_build_object('error',rejection,'requestId',p_request_id);
  UPDATE private.ptown_words_matches SET last_request_at=at_ms WHERE dealer_game_id=m.dealer_game_id;
 ELSE
  UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1,last_request_at=at_ms WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.ptown_words_settle(m.dealer_game_id);END IF;
  answer:=public.ptown_words_snapshot(m.dealer_game_id);
 END IF;
 INSERT INTO private.ptown_words_requests(dealer_game_id,request_id,actor,command,response) VALUES(m.dealer_game_id,p_request_id,actor,command,answer);
 RETURN answer;
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.delayed_create(uuid, uuid, boolean, jsonb)'::regprocedure)) NOT IN ('e1c9aaa627e0d23f77fbacd9802d01f0','2072b1e37696f301c935f009033c297e') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:public.delayed_create';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); receipt private.delayed_requests; fingerprint jsonb; parent uuid:=gen_random_uuid(); item jsonb; i integer:=0;
 cfg jsonb; frozen jsonb:='[]';
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 fingerprint:=jsonb_build_object('op','create','opponent',p_opponent,'realMoney',p_real_money,'lineup',p_lineup);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.match_id; END IF;
 PERFORM private.delayed_actor(p_opponent);
 IF actor_i=p_opponent OR p_real_money IS NULL OR jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup) NOT BETWEEN 1 AND 32
 THEN RAISE EXCEPTION 'delayed:invalid_offer'; END IF;
 IF NOT private.delayed_multi_enabled() AND (jsonb_array_length(p_lineup)<>1 OR p_lineup->0->>'game'<>'ptown-words') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 IF p_real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lineup) LOOP
  IF coalesce(item->>'game','') NOT IN('chess','ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'chess' THEN
   IF NOT private.chess_actor_allowed(auth.uid()) OR NOT private.chess_actor_allowed(p_opponent) OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND enabled AND admission_enabled AND async_enabled AND (NOT p_real_money OR real_qualified)) THEN RAISE EXCEPTION 'chess:async_closed';END IF;
   cfg:=private.chess_rules();
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules();
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();
  WHEN 'crib-lab','chucky-showdown' THEN
   IF NOT EXISTS(SELECT FROM private.originals_release WHERE game=item->>'game' AND async_enabled AND (NOT p_real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'originals:async_closed';END IF;
   cfg:=private.originals_config(item->>'game',CASE WHEN item->>'game'='crib-lab' THEN coalesce((item#>>'{config,sharedDeck}')::boolean,true) ELSE false END);
  WHEN 'take-two' THEN
   IF NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   cfg:=private.take_two_rules('take-two/2');
  WHEN 'mega-card-golf' THEN
   IF NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(actor_i,p_opponent,p_request,NULL,p_real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   cfg:=private.mega_competition_config(item->'config');END CASE;
  IF item ? 'config' AND item->'config' IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'delayed:unsupported_configuration'; END IF;
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 IF EXISTS(SELECT FROM private.mega_test_accounts WHERE user_id IN(actor_i,p_opponent)) THEN
  IF NOT private.mega_test_async_allowed(actor_i,p_opponent,p_request,NULL,p_real_money) OR jsonb_array_length(p_lineup)>4 OR EXISTS(SELECT FROM jsonb_array_elements(p_lineup) x WHERE x->>'game'<>'mega-card-golf') THEN RAISE EXCEPTION 'mega:test_offer_scope';END IF;
  UPDATE private.mega_test_async SET match_id=parent WHERE actor=actor_i AND request_id=p_request AND match_id IS NULL;
 END IF;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $function$
;

DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.delayed_home(uuid)'::regprocedure)) NOT IN ('a06c4a72c0adff9756e60d90af76e793','cae18d1f9af74f257a70fcec1db42207') THEN
  RAISE EXCEPTION 'words_five_minute:definition_drift:public.delayed_home';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=p_match)
  AND EXISTS(SELECT FROM public.delayed_match_updates WHERE match_id=p_match AND user_id=who) THEN
  RAISE EXCEPTION 'delayed:invitation_cancelled' USING ERRCODE='P0002';
 END IF;
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  item:=item||jsonb_build_object('playable',
   h->>'status'='active' AND NOT (h->>'held')::boolean AND NOT c.terminal AND c.actor=who
   AND least(c.expires_at,c.gameplay_due_at)>statement_timestamp(),
   'playableDeadline',least(c.expires_at,c.gameplay_due_at));
  -- Existing lobby ordering, presence and resume links use the current actionable deadline.
  IF (c.game_type='chess' OR c.game_type='ptown-words' AND c.config->>'version' IN ('ptown-words/2','ptown-words/4')) AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'crib-lab' THEN 3 WHEN 'chucky-showdown' THEN 3
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
;
