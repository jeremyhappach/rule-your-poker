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

-- Delayed Head-to-Head /1. Candidate only: no production admission or scheduler.
-- Account accounting remains debt-based. No funding, holds or child payouts.
CREATE TABLE private.delayed_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 admission_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.delayed_release DEFAULT VALUES;

CREATE TABLE private.delayed_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organizer uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 opponent uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 real_money boolean NOT NULL,
 status text NOT NULL DEFAULT 'invited' CHECK(status IN('invited','active','declined','cancelled','expired','settled')),
 offer jsonb NOT NULL, offer_hash text NOT NULL, policy_version text NOT NULL DEFAULT 'delayed/1',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '72 hours',
 accepted_at timestamptz, settled_at timestamptz,
 revision bigint NOT NULL DEFAULT 0,
 CHECK(organizer<>opponent), CHECK(expires_at>created_at)
);
CREATE TABLE private.delayed_children (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 32),
 game_type text NOT NULL CHECK(game_type IN('run21','tri-towers','ptown-words')),
 stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),
 config jsonb NOT NULL,
 starter uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 actor uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 segment bigint NOT NULL DEFAULT 0, revision bigint NOT NULL DEFAULT 0,
 available_at timestamptz, last_call_at timestamptz, expires_at timestamptz,
 started_at timestamptz, gameplay_due_at timestamptz,
 state jsonb, terminal boolean NOT NULL DEFAULT false,
 UNIQUE(match_id,ordinal), UNIQUE(id,match_id),
 CHECK((available_at IS NULL AND last_call_at IS NULL AND expires_at IS NULL) OR
  (available_at IS NOT NULL AND last_call_at IS NOT NULL AND expires_at IS NOT NULL
   AND last_call_at=available_at+interval '24 hours' AND expires_at=available_at+interval '36 hours'))
);
CREATE INDEX delayed_children_due ON private.delayed_children(expires_at) WHERE NOT terminal;
CREATE TABLE private.delayed_outcomes (
 child_id uuid PRIMARY KEY, match_id uuid NOT NULL,
 terminal_revision bigint NOT NULL, segment bigint NOT NULL,
 reason text NOT NULL CHECK(reason IN('normal','timeout_forfeit','draw','void')),
 winner uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 organizer_delta integer NOT NULL, opponent_delta integer NOT NULL,
 evidence jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(child_id,match_id) REFERENCES private.delayed_children(id,match_id) ON DELETE RESTRICT,
 CHECK(organizer_delta+opponent_delta=0),
 CHECK((reason IN('draw','void') AND winner IS NULL AND organizer_delta=0) OR
       (reason IN('normal','timeout_forfeit') AND winner IS NOT NULL AND organizer_delta<>0))
);
CREATE TABLE private.delayed_settlements (
 match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 game_id uuid NOT NULL UNIQUE REFERENCES public.games(id) ON DELETE RESTRICT,
 dealer_game_id uuid NOT NULL UNIQUE REFERENCES public.dealer_games(id) ON DELETE RESTRICT,
 result_id uuid NOT NULL UNIQUE REFERENCES public.game_results(id) ON DELETE RESTRICT,
 outcome_hash text NOT NULL, child_count integer NOT NULL,
 organizer_delta integer NOT NULL, opponent_delta integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(organizer_delta+opponent_delta=0)
);
CREATE TABLE private.delayed_requests (
 actor uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL, fingerprint jsonb NOT NULL,
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 response jsonb NOT NULL, PRIMARY KEY(actor,request_id)
);
CREATE TABLE private.delayed_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(), closed_at timestamptz,
 reason text NOT NULL, resolution jsonb,
 CHECK(closed_at IS NULL OR closed_at>=opened_at)
);
CREATE TABLE public.platform_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('invitation','turn','settled','invitation_closed')),
 actionable boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 1,
 read_revision bigint NOT NULL DEFAULT 0,
 payload jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,match_id,kind), CHECK(read_revision BETWEEN 0 AND revision)
);
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_owner ON public.platform_notifications FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.platform_notifications TO authenticated;
REVOKE ALL ON public.platform_notifications FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.platform_notifications FROM authenticated;
CREATE INDEX platform_notifications_user ON public.platform_notifications(user_id,actionable,updated_at DESC);

CREATE FUNCTION private.delayed_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'delayed:immutable_record' USING ERRCODE='42501'; END $$;
CREATE TRIGGER delayed_outcomes_immutable BEFORE UPDATE OR DELETE ON private.delayed_outcomes FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER delayed_settlements_immutable BEFORE UPDATE OR DELETE ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER delayed_requests_immutable BEFORE UPDATE OR DELETE ON private.delayed_requests FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE FUNCTION private.delayed_terms_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='delayed_matches' THEN
  IF (to_jsonb(NEW)-ARRAY['status','accepted_at','settled_at','revision']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','accepted_at','settled_at','revision']) THEN RAISE EXCEPTION 'delayed:frozen_offer'; END IF;
 ELSE
  IF (NEW.id,NEW.match_id,NEW.ordinal,NEW.game_type,NEW.stake,NEW.config) IS DISTINCT FROM
     (OLD.id,OLD.match_id,OLD.ordinal,OLD.game_type,OLD.stake,OLD.config) OR
     (OLD.starter IS NOT NULL AND NEW.starter IS DISTINCT FROM OLD.starter) OR
     (OLD.terminal AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'delayed:frozen_child'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delayed_frozen_offer BEFORE UPDATE ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.delayed_terms_guard();
CREATE TRIGGER delayed_frozen_child BEFORE UPDATE ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.delayed_terms_guard();

CREATE FUNCTION private.delayed_actor(actor uuid) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active)
 THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION private.delayed_held(parent uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL AND (match_id IS NULL OR match_id=parent))
$$;

-- One persistent row per recipient/match/kind. Read state never dismisses action.
CREATE FUNCTION private.delayed_notify(parent uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.delayed_matches; recipient uuid; n integer; earliest timestamptz; urgent boolean; p jsonb; k text; action boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent;
 FOREACH recipient IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT count(*),min(expires_at),coalesce(bool_or(last_call_at<=clock_timestamp()),false)
   INTO n,earliest,urgent FROM private.delayed_children WHERE match_id=m.id AND NOT terminal AND actor=recipient;
  FOREACH k IN ARRAY ARRAY['invitation','turn','settled','invitation_closed'] LOOP
   action:=CASE k WHEN 'invitation' THEN m.status='invited' AND recipient=m.opponent AND clock_timestamp()<m.expires_at
    WHEN 'turn' THEN m.status='active' AND n>0 AND NOT private.delayed_held(m.id) ELSE false END;
   IF k='settled' AND m.status<>'settled' OR k='invitation_closed' AND m.status NOT IN('declined','cancelled','expired') THEN CONTINUE; END IF;
   p:=jsonb_build_object('status',m.status,'opponentId',CASE WHEN recipient=m.organizer THEN m.opponent ELSE m.organizer END,
    'availableCount',CASE WHEN k='turn' AND action THEN n ELSE 0 END,'earliestDeadline',CASE WHEN k='turn' AND action THEN earliest END,
    'lastCall',k='turn' AND action AND urgent,'held',private.delayed_held(m.id));
   INSERT INTO public.platform_notifications(user_id,match_id,kind,actionable,payload)
    VALUES(recipient,m.id,k,action,p)
    ON CONFLICT(user_id,match_id,kind) DO UPDATE SET actionable=EXCLUDED.actionable,payload=EXCLUDED.payload,
     revision=platform_notifications.revision+1,updated_at=clock_timestamp()
    WHERE (platform_notifications.actionable,platform_notifications.payload) IS DISTINCT FROM (EXCLUDED.actionable,EXCLUDED.payload);
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION public.delayed_notification_read(p_id uuid,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.delayed_actor(auth.uid());
 UPDATE public.platform_notifications SET read_revision=greatest(read_revision,least(revision,p_revision))
 WHERE id=p_id AND user_id=auth.uid() AND p_revision>=0;
END $$;

-- A parent only enters canonical session accounting when all children are terminal.
-- Never insert a joinable/live status: WAL subscribers can see each committed
-- change even though ordinary readers see only the final session_ended row.
CREATE FUNCTION private.delayed_finalize(parent uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches; receipt private.delayed_settlements; n integer; completed integer;
 net_i bigint; hash text; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); dg uuid:=gen_random_uuid(); result_id uuid:=gen_random_uuid(); changes jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 SELECT * INTO receipt FROM private.delayed_settlements WHERE match_id=parent;
 IF FOUND THEN RETURN to_jsonb(receipt); END IF;
 IF m.status<>'active' OR private.delayed_held(parent) THEN RAISE EXCEPTION 'delayed:not_settleable'; END IF;
 SELECT count(*) INTO n FROM private.delayed_children WHERE match_id=parent;
 SELECT count(*),coalesce(sum(o.organizer_delta),0),md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY c.ordinal)::text,''))
  INTO completed,net_i,hash FROM private.delayed_children c JOIN private.delayed_outcomes o ON o.child_id=c.id AND o.match_id=c.match_id
  WHERE c.match_id=parent AND c.terminal;
 IF n=0 OR n<>jsonb_array_length(m.offer) OR completed<>n THEN RETURN NULL; END IF;
 IF abs(net_i)>2147483647 THEN RAISE EXCEPTION 'delayed:amount_overflow'; END IF;
 INSERT INTO public.games(id,name,game_type,status,current_host,real_money,pot,buy_in)
  VALUES(parent,'Delayed Head-to-Head','delayed-head-to-head','game_over',m.organizer,m.real_money,0,0);
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config)
  VALUES(dg,parent,m.organizer,'delayed-head-to-head',jsonb_build_object('offerHash',m.offer_hash,'policy',m.policy_version));
 UPDATE public.games SET current_game_uuid=dg WHERE id=parent;
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot,sitting_out,waiting)
  VALUES(a,parent,m.organizer,1,0,'active',false,false,false),(b,parent,m.opponent,2,0,'active',false,false,false);
 changes:=jsonb_build_object(a::text,net_i,b::text,-net_i);
 INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,
  winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(result_id,parent,dg,1,'delayed_parent','delayed-head-to-head',CASE WHEN net_i>0 THEN a WHEN net_i<0 THEN b END,
  CASE WHEN net_i=0 THEN 'Tie' ELSE (SELECT username FROM public.profiles WHERE id=CASE WHEN net_i>0 THEN m.organizer ELSE m.opponent END) END,
  'Delayed match aggregate',abs(net_i)::integer,changes,net_i=0);
 IF net_i<>0 THEN
  PERFORM public.settle_gameplay_chip_transfers(parent,jsonb_build_array(jsonb_build_object(
   'from',jsonb_build_object('kind','player','playerId',CASE WHEN net_i>0 THEN b ELSE a END),
   'to',jsonb_build_object('kind','player','playerId',CASE WHEN net_i>0 THEN a ELSE b END),'amount',abs(net_i)::integer)),'win');
 END IF;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
 SELECT parent,dg,1,p.id,p.user_id,pr.username,p.chips,false FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=parent;
 -- record_session_results owns account posting from these final snapshots.
 UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp(),game_over_at=clock_timestamp(),pending_session_end=false WHERE id=parent;
 IF m.real_money AND ((SELECT count(*) FROM public.player_transactions WHERE source_game_id=parent AND transaction_type='SessionResult')<>2
  OR NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=parent AND profile_id=m.organizer AND transaction_type='SessionResult' AND player_transactions.amount=net_i)
  OR NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=parent AND profile_id=m.opponent AND transaction_type='SessionResult' AND player_transactions.amount=-net_i))
 THEN RAISE EXCEPTION 'delayed:account_posting_mismatch'; END IF;
 INSERT INTO private.delayed_settlements(match_id,game_id,dealer_game_id,result_id,outcome_hash,child_count,organizer_delta,opponent_delta)
 VALUES(parent,parent,dg,result_id,hash,n,net_i,-net_i) RETURNING * INTO receipt;
 UPDATE private.delayed_matches SET status='settled',settled_at=clock_timestamp(),revision=revision+1 WHERE id=parent;
 PERFORM private.delayed_notify(parent);
 RETURN to_jsonb(receipt);
END $$;

-- Called only by qualified private adapters. Never grant this to service/API roles.
CREATE FUNCTION private.delayed_record_outcome(child uuid,expected_revision bigint,reason_i text,winner_i uuid,evidence_i jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c private.delayed_children; m private.delayed_matches; old private.delayed_outcomes; delta_i integer;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 SELECT * INTO old FROM private.delayed_outcomes WHERE child_id=child;
 IF FOUND THEN
  IF (old.terminal_revision,old.reason,old.winner,old.evidence) IS DISTINCT FROM (expected_revision,reason_i,winner_i,evidence_i)
  THEN RAISE EXCEPTION 'delayed:outcome_conflict'; END IF;
  RETURN to_jsonb(old);
 END IF;
 IF m.status<>'active' OR c.terminal OR c.revision IS DISTINCT FROM expected_revision OR private.delayed_held(m.id)
 THEN RAISE EXCEPTION 'delayed:stale_outcome'; END IF;
 IF reason_i IS NULL OR reason_i NOT IN('normal','timeout_forfeit','draw','void') OR evidence_i IS NULL
 OR (reason_i IN('normal','timeout_forfeit') AND (winner_i IS NULL OR winner_i NOT IN(m.organizer,m.opponent)))
 OR (reason_i IN('draw','void') AND winner_i IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_outcome'; END IF;
 delta_i:=CASE WHEN winner_i=m.organizer THEN c.stake WHEN winner_i=m.opponent THEN -c.stake ELSE 0 END;
 INSERT INTO private.delayed_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i) RETURNING * INTO old;
 UPDATE private.delayed_children SET terminal=true,revision=revision+1 WHERE id=c.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_finalize(m.id);
 PERFORM private.delayed_notify(m.id);
 RETURN to_jsonb(old);
END $$;

-- No public winner/amount arguments. Exact-generation expiry only.
CREATE FUNCTION private.delayed_expire(child uuid,expected_segment bigint,expected_expiry timestamptz) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c private.delayed_children; m private.delayed_matches;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment OR c.expires_at IS DISTINCT FROM expected_expiry
  OR c.expires_at IS NULL OR clock_timestamp()<c.expires_at THEN RETURN false; END IF;
 -- An earlier active-game deadline must be resolved by the game adapter first.
 IF c.gameplay_due_at IS NOT NULL AND c.gameplay_due_at<c.expires_at THEN RETURN false; END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',CASE WHEN c.actor=m.organizer THEN m.opponent ELSE m.organizer END,
  jsonb_build_object('segment',c.segment,'expiredAt',c.expires_at,'actor',c.actor));
 RETURN true;
END $$;

CREATE FUNCTION public.delayed_create(p_request uuid,p_opponent uuid,p_real_money boolean,p_lineup jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF actor_i=p_opponent OR p_real_money IS NULL OR jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup)<>1 OR p_real_money
 THEN RAISE EXCEPTION 'delayed:invalid_offer'; END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lineup) LOOP
  IF coalesce(item->>'game','')<>'ptown-words' OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  cfg:=private.ptown_words_rules_for('ptown-words/3');
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $$;

CREATE FUNCTION public.delayed_respond(p_match uuid,p_request uuid,p_offer_hash text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF m.real_money OR c.game_type<>'ptown-words' OR (SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $$;

-- Default-deny every new private owner, including trusted HTTP/worker roles.
REVOKE ALL ON private.delayed_release,private.delayed_matches,private.delayed_children,private.delayed_outcomes,
 private.delayed_settlements,private.delayed_requests,private.delayed_incidents FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.delayed_immutable(),private.delayed_terms_guard(),private.delayed_actor(uuid),private.delayed_held(uuid),
 private.delayed_notify(uuid),private.delayed_finalize(uuid),private.delayed_record_outcome(uuid,bigint,text,uuid,jsonb),
 private.delayed_expire(uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.delayed_create(uuid,uuid,boolean,jsonb),public.delayed_respond(uuid,uuid,text,text),public.delayed_notification_read(uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_create(uuid,uuid,boolean,jsonb),public.delayed_respond(uuid,uuid,text,text),public.delayed_notification_read(uuid,bigint) TO authenticated;

CREATE INDEX delayed_matches_organizer ON private.delayed_matches(organizer,created_at DESC,id);
CREATE INDEX delayed_matches_opponent ON private.delayed_matches(opponent,created_at DESC,id);
CREATE INDEX delayed_invites_due ON private.delayed_matches(expires_at) WHERE status='invited';
CREATE INDEX delayed_gameplay_due ON private.delayed_children(gameplay_due_at) WHERE NOT terminal;

CREATE TABLE public.delayed_match_updates (
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id),user_id uuid NOT NULL REFERENCES public.profiles(id),
 revision bigint NOT NULL,PRIMARY KEY(match_id,user_id)
);
ALTER TABLE public.delayed_match_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY delayed_update_owner ON public.delayed_match_updates FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.delayed_match_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.delayed_match_updates TO authenticated;
CREATE FUNCTION private.delayed_signal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.delayed_match_updates VALUES(NEW.id,NEW.organizer,NEW.revision),(NEW.id,NEW.opponent,NEW.revision)
 ON CONFLICT(match_id,user_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER delayed_signal AFTER INSERT OR UPDATE OF revision ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.delayed_signal();
REVOKE ALL ON FUNCTION private.delayed_signal() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',true,'max_children',1,'games',jsonb_build_array(jsonb_build_object('id','ptown-words','rules',private.ptown_words_rules_for('ptown-words/3')))) WHERE auth.uid() IS NOT NULL
$$;
CREATE FUNCTION public.delayed_home(p_match uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;who uuid:=auth.uid();lineup jsonb;net bigint;finished integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'ordinal',c.ordinal,'game',c.game_type,'stake',c.stake,'config',c.config,
  'starter',c.starter,'actor',c.actor,'segment',c.segment,'revision',c.revision,'terminal',c.terminal,
  'availableAt',c.available_at,'lastCallAt',c.last_call_at,'expiresAt',c.expires_at,'startedAt',c.started_at,'scores',c.state->'scores','lastMove',c.state->'moves'->-1,
  'result',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'at',o.completed_at,
   'delta',CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END) ORDER BY c.ordinal),
  coalesce(sum(CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END),0),count(o.child_id)
 INTO lineup,net,finished FROM private.delayed_children c LEFT JOIN private.delayed_outcomes o ON o.child_id=c.id WHERE c.match_id=m.id;
 RETURN jsonb_build_object('id',m.id,'status',m.status,'revision',m.revision,'realMoney',m.real_money,'offerHash',m.offer_hash,
  'organizer',m.organizer,'opponent',m.opponent,'players',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',username)) FROM public.profiles WHERE id IN(m.organizer,m.opponent)),
  'createdAt',m.created_at,'invitationExpiresAt',m.expires_at,'acceptedAt',m.accepted_at,'settledAt',m.settled_at,
  'held',private.delayed_held(m.id),'lineup',lineup,'net',net,'completed',finished,
  'exposure',(SELECT sum(stake) FROM private.delayed_children WHERE match_id=m.id),
  'receipt',(SELECT to_jsonb(s) FROM private.delayed_settlements s WHERE match_id=m.id),
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;
CREATE FUNCTION public.delayed_list(p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(public.delayed_home(id) ORDER BY created_at DESC,id DESC),'[]'::jsonb)
 FROM (SELECT id,created_at FROM private.delayed_matches WHERE auth.uid() IN(organizer,opponent)
 AND (p_before IS NULL OR (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) ORDER BY created_at DESC,id DESC LIMIT 30) m
$$;
-- Names and UUIDs only; account balances never enter opponent selection.
CREATE FUNCTION public.delayed_opponents(p_search text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',username) ORDER BY username),'[]'::jsonb)
 FROM (SELECT id,username FROM public.profiles WHERE auth.uid() IS NOT NULL AND is_active AND id<>auth.uid()
  AND length(trim(p_search)) BETWEEN 2 AND 80 AND position(lower(trim(p_search)) IN lower(username))>0 ORDER BY username,id LIMIT 20) p
$$;
REVOKE ALL ON FUNCTION public.delayed_capabilities(),public.delayed_home(uuid),public.delayed_list(timestamptz,uuid),public.delayed_opponents(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_capabilities(),public.delayed_home(uuid),public.delayed_list(timestamptz,uuid),public.delayed_opponents(text) TO authenticated;
-- Publication membership is installed only with the approved migration.
CREATE FUNCTION public.platform_notification_center() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('actionable',(SELECT count(*) FROM public.platform_notifications WHERE user_id=auth.uid() AND actionable),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY actionable DESC,updated_at DESC),'[]'::jsonb) FROM (
  SELECT * FROM public.platform_notifications WHERE user_id=auth.uid() AND (actionable OR kind IN('settled','invitation_closed'))
  ORDER BY actionable DESC,updated_at DESC,id LIMIT 50) n))
$$;
REVOKE ALL ON FUNCTION public.platform_notification_center() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_notification_center() TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_notifications,public.delayed_match_updates;

-- Operations-only incident recovery. No browser or service-role grants. An
-- operator records verified downtime; no player-triggered pause or grace period.
CREATE FUNCTION private.delayed_incident_open(p_match uuid,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE incident uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(731907241);
 IF length(trim(p_reason))<8 THEN RAISE EXCEPTION 'delayed:incident_reason_required';END IF;
 IF EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL AND (p_match IS NULL OR match_id IS NULL OR match_id=p_match))
 THEN RAISE EXCEPTION 'delayed:overlapping_incident';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE status='active' AND (p_match IS NULL OR id=p_match) ORDER BY id FOR UPDATE;
 INSERT INTO private.delayed_incidents(match_id,reason) VALUES(p_match,p_reason) RETURNING id INTO incident;
 UPDATE private.delayed_children SET revision=revision+1 WHERE NOT terminal AND match_id IN(SELECT id FROM private.delayed_matches WHERE status='active' AND (p_match IS NULL OR id=p_match));
 UPDATE private.delayed_matches SET revision=revision+1 WHERE status='active' AND (p_match IS NULL OR id=p_match);
 PERFORM private.delayed_notify(id) FROM private.delayed_matches WHERE status='active' AND (p_match IS NULL OR id=p_match);
 RETURN incident;
END $$;
CREATE FUNCTION private.delayed_incident_close(p_incident uuid,p_resolution text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE incident private.delayed_incidents;c private.delayed_children;finished timestamptz:=clock_timestamp();shift interval;ms bigint;s jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO STRICT incident FROM private.delayed_incidents WHERE id=p_incident FOR UPDATE;
 IF incident.closed_at IS NOT NULL THEN RETURN;END IF;
 IF length(trim(p_resolution))<8 THEN RAISE EXCEPTION 'delayed:incident_resolution_required';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id) ORDER BY id FOR UPDATE;
 FOR c IN SELECT child_row.* FROM private.delayed_children child_row JOIN private.delayed_matches m ON m.id=child_row.match_id
  WHERE m.status='active' AND NOT child_row.terminal AND (incident.match_id IS NULL OR m.id=incident.match_id) ORDER BY child_row.match_id,child_row.id FOR UPDATE OF child_row LOOP
  shift:=finished-greatest(incident.opened_at,c.available_at);
  IF shift<=interval '0 seconds' THEN CONTINUE;END IF;
  ms:=floor(extract(epoch FROM shift)*1000);shift:=ms*interval '1 millisecond';s:=c.state;
  IF c.game_type='ptown-words' AND s->>'deadline' IS NOT NULL THEN s:=jsonb_set(s,'{deadline}',to_jsonb((s->>'deadline')::bigint+ms));END IF;
  IF s#>>'{board,deadline}' IS NOT NULL THEN s:=jsonb_set(s,'{board,deadline}',to_jsonb((s#>>'{board,deadline}')::bigint+ms));END IF;
  IF s#>>'{board,startedAt}' IS NOT NULL THEN s:=jsonb_set(s,'{board,startedAt}',to_jsonb((s#>>'{board,startedAt}')::bigint+ms));END IF;
  IF s->>'segmentStartedAt' IS NOT NULL THEN s:=jsonb_set(s,'{segmentStartedAt}',to_jsonb((s->>'segmentStartedAt')::bigint+ms));END IF;
  UPDATE private.delayed_children SET available_at=available_at+shift,last_call_at=last_call_at+shift,expires_at=expires_at+shift,
   started_at=started_at+shift,gameplay_due_at=gameplay_due_at+shift,state=s,revision=revision+1 WHERE id=c.id;
 END LOOP;
 UPDATE private.delayed_incidents SET closed_at=finished,resolution=jsonb_build_object('note',p_resolution,'policy','measured_hold_duration') WHERE id=incident.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id);
 PERFORM private.delayed_notify(id) FROM private.delayed_matches WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id);
END $$;
REVOKE ALL ON FUNCTION private.delayed_incident_open(uuid,text),private.delayed_incident_close(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Async Words owns orchestration only. Shared /3 rules own every legal move.
CREATE TABLE private.delayed_word_commands (
 actor uuid NOT NULL, request_id uuid NOT NULL, child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 fingerprint jsonb NOT NULL, response jsonb NOT NULL, PRIMARY KEY(actor,request_id)
);
ALTER TABLE private.delayed_word_commands ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER delayed_word_commands_immutable BEFORE UPDATE OR DELETE ON private.delayed_word_commands FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TABLE private.delayed_words_health(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,last_tick timestamptz);
INSERT INTO private.delayed_words_health DEFAULT VALUES;
ALTER TABLE private.delayed_words_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_word_commands,private.delayed_words_health FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.delayed_words_view(child uuid,viewer uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;receipt private.delayed_settlements;s jsonb;held boolean;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 IF viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent) OR m.status NOT IN('active','settled') OR c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM private.delayed_outcomes WHERE child_id=c.id;
 SELECT * INTO receipt FROM private.delayed_settlements WHERE match_id=m.id;
 held:=private.delayed_held(m.id);
 s:=private.ptown_words_visible(c.state,viewer::text);
 RETURN s||jsonb_build_object('identity',jsonb_build_object('sessionId',m.id,'dealerGameId',c.id,'roundId',c.id),
 'revision',c.revision,'viewerId',viewer,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
 'deadline',floor(extract(epoch FROM c.expires_at)*1000),'lastCallAt',floor(extract(epoch FROM c.last_call_at)*1000),
 'canAct',NOT c.terminal AND NOT held AND c.actor=viewer,'paused',held,'pausedAt',NULL,'finished',c.terminal,
 'phase',CASE WHEN c.terminal THEN 'complete' ELSE 'playing' END,'settlement',CASE WHEN receipt.match_id IS NOT NULL THEN jsonb_build_object(m.organizer::text,receipt.organizer_delta,m.opponent::text,receipt.opponent_delta) END,
 'outcome',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'delta',CASE WHEN viewer=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END,
 'terminal',CASE WHEN c.terminal THEN jsonb_build_object('resultId',receipt.result_id,'winnerIds',CASE WHEN o.winner IS NULL THEN jsonb_build_array(m.organizer,m.opponent) ELSE jsonb_build_array(o.winner) END,'score',(SELECT max(value::int) FROM jsonb_each_text(c.state->'scores')),'startedAt',floor(extract(epoch FROM o.completed_at)*1000),'deadline',floor(extract(epoch FROM o.completed_at)*1000)) END,
 'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',receipt.result_id,'batch',NULL));
END $$;

CREATE FUNCTION public.delayed_words_snapshot(p_child uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();
BEGIN
 PERFORM private.delayed_actor(who);
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 -- Read may catch up an overdue turn; it never creates a fresh availability window.
 IF NOT c.terminal AND NOT private.delayed_held(m.id) THEN PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);END IF;
 RETURN private.delayed_words_view(p_child,who);
END $$;

CREATE FUNCTION public.delayed_words_action(p_child uuid,p_request uuid,p_revision bigint,p_action text,p_items jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid();c private.delayed_children;m private.delayed_matches;prior private.delayed_word_commands;
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'action',p_action,'items',p_items);s jsonb;answer jsonb;at_time timestamptz;at_ms bigint;winner uuid;rejection text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO prior FROM private.delayed_word_commands WHERE actor=who AND request_id=p_request;
 IF FOUND THEN IF prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;RETURN prior.response;END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' OR m.real_money THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000);
 IF NOT c.terminal AND NOT private.delayed_held(m.id) AND at_time>=c.expires_at THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:deadline');
 ELSIF c.terminal THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:terminal');
 ELSE
  IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:on_hold';END IF;
  IF c.actor IS DISTINCT FROM who THEN RAISE EXCEPTION 'delayed:not_your_turn' USING ERRCODE='42501';END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'delayed:stale_revision';END IF;
  IF p_action IS NULL OR p_action NOT IN('place','pass','exchange') OR (p_action='pass' AND p_items IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_action';END IF;
  BEGIN s:=private.ptown_words_reduce(c.state,p_action,p_items,at_ms);
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS rejection=MESSAGE_TEXT;END;
  IF rejection IS NOT NULL THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error',rejection);
  ELSE
   UPDATE private.delayed_children SET state=s,revision=revision+1,
    actor=(s->'players'->(s->>'turnIndex')::int->>'id')::uuid,segment=segment+1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours'
   WHERE id=c.id RETURNING * INTO c;
   UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
   IF s->>'phase'='complete' THEN
    winner:=CASE WHEN jsonb_array_length(s->'winnerIds')=1 THEN (s->'winnerIds'->>0)::uuid END;
    PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,
     jsonb_build_object('rules',c.config,'finalState',s,'endReason',s->>'endReason'));
   ELSE PERFORM private.delayed_notify(m.id);END IF;
   answer:=private.delayed_words_view(c.id,who);
  END IF;
 END IF;
 INSERT INTO private.delayed_word_commands VALUES(who,p_request,p_child,fingerprint,answer);
 RETURN answer;
END $$;

CREATE FUNCTION private.delayed_words_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;c private.delayed_children;n integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF NOT EXISTS(SELECT FROM private.delayed_words_health WHERE singleton AND enabled) THEN RETURN 0;END IF;
 FOR m IN SELECT * FROM private.delayed_matches WHERE status='invited' AND expires_at<=clock_timestamp() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id;PERFORM private.delayed_notify(m.id);n:=n+1;
 END LOOP;
 FOR m IN SELECT * FROM private.delayed_matches WHERE status='active' AND NOT private.delayed_held(id) AND EXISTS(
  SELECT FROM private.delayed_children work_child WHERE work_child.match_id=delayed_matches.id AND NOT work_child.terminal AND
  (work_child.expires_at<=clock_timestamp() OR (work_child.last_call_at<=clock_timestamp() AND EXISTS(SELECT FROM public.platform_notifications n WHERE n.match_id=work_child.match_id AND n.user_id=work_child.actor AND n.kind='turn' AND n.actionable AND NOT (n.payload->>'lastCall')::boolean))))
 ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  IF private.delayed_held(m.id) THEN CONTINUE;END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id AND NOT terminal ORDER BY id FOR UPDATE LOOP
   IF private.delayed_expire(c.id,c.segment,c.expires_at) THEN n:=n+1;END IF;
  END LOOP;
  PERFORM private.delayed_notify(m.id);
 END LOOP;
 UPDATE private.delayed_words_health SET last_tick=clock_timestamp() WHERE singleton;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_view(uuid,uuid),private.delayed_words_recover(),public.delayed_words_snapshot(uuid),public.delayed_words_action(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_words_snapshot(uuid),public.delayed_words_action(uuid,uuid,bigint,text,jsonb) TO authenticated;
-- Scheduler and admission stay disabled until exact-source publication is verified.

-- A missed recovery heartbeat holds adjudication until an operator resolves it.
-- Call before the shared incident gate; never upgrade a held shared lock.
CREATE FUNCTION private.delayed_words_check_health() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h private.delayed_words_health;i uuid;
BEGIN
 SELECT * INTO STRICT h FROM private.delayed_words_health WHERE singleton;
 IF h.enabled AND h.last_tick IS NOT NULL AND h.last_tick>=clock_timestamp()-interval '2 minutes' THEN RETURN;END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE status='active') THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO STRICT h FROM private.delayed_words_health WHERE singleton FOR UPDATE;
 IF h.enabled AND h.last_tick IS NOT NULL AND h.last_tick>=clock_timestamp()-interval '2 minutes' THEN RETURN;END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL AND match_id IS NULL) THEN
  -- Do not overlap a scoped incident: require operations review before widening.
  IF EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL) THEN RAISE EXCEPTION 'delayed:recovery_unhealthy';END IF;
  i:=private.delayed_incident_open(NULL,'Recovery heartbeat missing; adjudication held for operations review');
  UPDATE private.delayed_incidents SET opened_at=coalesce(h.last_tick,opened_at) WHERE id=i;
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_check_health() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f text;source text;BEGIN
 FOREACH f IN ARRAY ARRAY['public.delayed_words_snapshot(uuid)','public.delayed_words_action(uuid,uuid,bigint,text,jsonb)','private.delayed_words_recover()','public.delayed_respond(uuid,uuid,text,text)'] LOOP
  source:=pg_get_functiondef(f::regprocedure);
  IF position('PERFORM pg_advisory_xact_lock_shared(731907241);' IN source)=0 THEN RAISE EXCEPTION 'Health gate preimage missing';END IF;
  EXECUTE replace(source,'PERFORM pg_advisory_xact_lock_shared(731907241);','PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);');
 END LOOP;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['delayed_release','delayed_matches','delayed_children','delayed_outcomes','delayed_settlements','delayed_requests','delayed_incidents'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);END LOOP;
END $$;
