-- Refuse to overwrite a newer canonical owner. Reinspect drift; never remove this guard to force installation.
DO $$ BEGIN
 IF md5(pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure))<>'18f1042a7eb294005b3c9d3eaee2d767'
 OR md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure))<>'4103ca5c1f6acd06c89c4d86fcfa2c91'
 OR md5(pg_get_functiondef('private.megatouch_frozen_stake()'::regprocedure))<>'d3efe1f605eea056169a8b674017958f'
 OR md5(pg_get_functiondef('public.settle_gameplay_chip_transfers(uuid,jsonb,text)'::regprocedure))<>'de14ab5df0a703cfd8c1ed43aa5a819c'
 OR md5(pg_get_functiondef('public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)'::regprocedure))<>'c633a318c7f2605104c92e03d3b3b09a'
 THEN RAISE EXCEPTION 'race_poker:canonical_definition_drift';END IF;
END $$;

-- Approved Ptown adaptation; not a claim of historical Merit rule parity.
-- Card identity: suit * 13 + rank - 2, suits clubs/diamonds/hearts/spades.
CREATE OR REPLACE FUNCTION private.race_poker_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"race-poker/1","handMs":30000,"holdMs":2000,"target":48000,"roundCap":16,"deckSize":52,"choices":3,"handSize":5,"equalFinalHands":true,"fifthReplacement":false,"timeoutPoints":0,"awards":[4500,6700,9000,12000,15000,18700,22500,28500,37500]}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.race_poker_random(bound_i integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE bytes bytea; value_i bigint; limit_i bigint;
BEGIN
 IF bound_i IS NULL OR bound_i<1 THEN RAISE EXCEPTION 'race_poker:random_bound';END IF;
 limit_i:=4294967296-(4294967296%bound_i);
 LOOP
  bytes:=extensions.gen_random_bytes(4);
  value_i:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)*65536+get_byte(bytes,2)*256+get_byte(bytes,3);
  EXIT WHEN value_i<limit_i;
 END LOOP;
 RETURN (value_i%bound_i)::integer;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_shuffle() RETURNS integer[]
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=ARRAY(SELECT generate_series(0,51));i integer;j integer;swap integer;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  j:=private.race_poker_random(i)+1;swap:=cards[i];cards[i]:=cards[j];cards[j]:=swap;
 END LOOP;
 RETURN cards;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_score(cards integer[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE ranks integer[];groups integer[];flush_i boolean;straight_i boolean;points integer;label text;
BEGIN
 IF cardinality(cards) IS DISTINCT FROM 5 OR
  EXISTS(SELECT 1 FROM unnest(cards)c WHERE c IS NULL OR c<0 OR c>51) OR
  (SELECT count(DISTINCT c) FROM unnest(cards)c)<>5 THEN RAISE EXCEPTION 'race_poker:invalid_cards';END IF;
 SELECT array_agg(r ORDER BY r) INTO ranks FROM (SELECT DISTINCT c%13+2 r FROM unnest(cards)c) q;
 SELECT array_agg(n ORDER BY n DESC) INTO groups FROM (SELECT count(*)::integer n FROM unnest(cards)c GROUP BY c%13) q;
 SELECT count(DISTINCT c/13)=1 INTO flush_i FROM unnest(cards)c;
 straight_i:=cardinality(ranks)=5 AND (ranks[5]-ranks[1]=4 OR ranks=ARRAY[2,3,4,5,14]);
 IF flush_i AND straight_i AND ranks=ARRAY[10,11,12,13,14] THEN points:=37500;label:='Royal flush';
 ELSIF flush_i AND straight_i THEN points:=28500;label:='Straight flush';
 ELSIF groups=ARRAY[4,1] THEN points:=22500;label:='Four of a kind';
 ELSIF groups=ARRAY[3,2] THEN points:=18700;label:='Full house';
 ELSIF flush_i THEN points:=15000;label:='Flush';
 ELSIF straight_i THEN points:=12000;label:='Straight';
 ELSIF groups=ARRAY[3,1,1] THEN points:=9000;label:='Three of a kind';
 ELSIF groups=ARRAY[2,2,1] THEN points:=6700;label:='Two pair';
 ELSIF groups=ARRAY[2,1,1,1] THEN points:=4500;label:='Pair';
 ELSE points:=ranks[cardinality(ranks)]*100;label:='High card';END IF;
 RETURN jsonb_build_object('label',label,'points',points);
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor'])||jsonb_build_object('activePlayerId',s->'players'->(s->>'turnIndex')::integer->>'id')
$$;

CREATE OR REPLACE FUNCTION private.race_poker_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=private.race_poker_shuffle();starter integer;totals jsonb;
BEGIN
 IF s->'rules' IS DISTINCT FROM private.race_poker_rules() OR jsonb_array_length(s->'players')<>2 THEN RAISE EXCEPTION 'race_poker:configuration';END IF;
 IF NOT s ? 'starter' THEN
  starter:=private.race_poker_random(2);
  SELECT jsonb_object_agg(p->>'id',0) INTO totals FROM jsonb_array_elements(s->'players')p;
  s:=s||jsonb_build_object('starter',starter,'turnIndex',starter,'handInRound',0,'stage',1,'scores',totals,'stages','[]'::jsonb,'botPolicy','race-poker-bot/1');
 END IF;
 RETURN s||jsonb_build_object('deck',to_jsonb(cards),'cursor',3,'choices',to_jsonb(cards[1:3]),'hand','[]'::jsonb,
  'phase','playing','startedAt',at_ms,'deadline',at_ms+30000,'result',NULL,
  'event',jsonb_build_object('label',CASE WHEN coalesce((s->>'finalHand')::boolean,false) THEN 'Final hand' ELSE 'Choose a card' END,'points',0));
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE player text:=s->'players'->(s->>'turnIndex')::integer->>'id';hand_i jsonb:=s->'hand';
 result_i jsonb;points integer:=0;before_i integer:=(s->'scores'->>player)::integer;slot integer;cursor_i integer;
 round_i integer:=(s->>'stage')::integer;starter_i integer:=(s->>'starter')::integer;deadline_i bigint:=(s->>'deadline')::bigint;
BEGIN
 IF s->'rules' IS DISTINCT FROM private.race_poker_rules() THEN RAISE EXCEPTION 'race_poker:configuration';END IF;
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'race_poker:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action<>'tick' THEN RAISE EXCEPTION 'race_poker:phase';END IF;
  IF at_ms<deadline_i THEN RETURN s;END IF;
  IF (s->>'handInRound')::integer=1 THEN
   IF round_i=16 OR EXISTS(SELECT 1 FROM jsonb_each_text(s->'scores')v WHERE v.value::integer>=48000) THEN
    RETURN s||jsonb_build_object('phase','complete','deadline',0,'choices','[]'::jsonb,'hand','[]'::jsonb);
   END IF;
   starter_i:=1-starter_i;
   s:=s||jsonb_build_object('stage',round_i+1,'starter',starter_i,'turnIndex',starter_i,'handInRound',0,'finalHand',false);
  ELSE
   s:=s||jsonb_build_object('turnIndex',1-starter_i,'handInRound',1,'finalHand',
    EXISTS(SELECT 1 FROM jsonb_each_text(s->'scores')v WHERE v.value::integer>=48000));
  END IF;
  RETURN private.race_poker_deal(s,deadline_i);
 END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'race_poker:phase';END IF;
 IF action='tick' THEN
  IF at_ms<deadline_i THEN RETURN s;END IF;
  result_i:=jsonb_build_object('label','Time expired — 0 points','points',0,'reason','timeout');
  hand_i:='[]'::jsonb;at_ms:=deadline_i;
 ELSIF action='choose' THEN
  IF at_ms>=deadline_i THEN RAISE EXCEPTION 'race_poker:deadline';END IF;
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
  slot:=items[1];
  hand_i:=hand_i||jsonb_build_array(s->'choices'->slot);
  IF jsonb_array_length(hand_i)<5 THEN
   cursor_i:=(s->>'cursor')::integer;
   RETURN jsonb_set(s,ARRAY['choices',slot::text],s->'deck'->cursor_i)||
    jsonb_build_object('hand',hand_i,'cursor',cursor_i+1,'event',jsonb_build_object('label','Card selected','points',0,'slot',slot));
  END IF;
  -- Fifth pick: score and commit, never read or reveal the next hidden card.
  result_i:=private.race_poker_score(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(hand_i)))||'{"reason":"hand"}'::jsonb;
  points:=(result_i->>'points')::integer;
 ELSE RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 result_i:=result_i||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',round_i,player),
  'playerId',player,'stage',round_i,'hand',hand_i,'scoreBefore',before_i,'score',before_i+points,'stageScore',points,'completedAt',at_ms);
 s:=jsonb_set(s,ARRAY['scores',player],to_jsonb(before_i+points));
 RETURN (s-ARRAY['deck','cursor'])||jsonb_build_object('hand',hand_i,'choices','[]'::jsonb,'phase','stage_complete','deadline',at_ms+2000,
  'result',result_i,'stages',s->'stages'||jsonb_build_array(result_i),'event',result_i);
END $$;

-- Separately versioned policy. The function accepts only an explicit public
-- hand and choices, never a match, deck, cursor, or shuffle seed.
-- Deterministic hypothetical samples allow exact hidden-order independence tests.
CREATE OR REPLACE FUNCTION private.race_poker_bot_choice(hand_i integer[],choices_i integer[]) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE candidate integer;trial integer;draw_i integer;sample_i integer[];unseen integer[];pool integer[];j integer;
 total_i bigint;best bigint:=-1;best_i integer:=0;key_i bigint;chosen integer;other integer;value_i integer;best_value integer;count_i integer;
BEGIN
 IF cardinality(choices_i)<>3 OR cardinality(hand_i)>4 THEN RAISE EXCEPTION 'race_poker:bot_input';END IF;
 SELECT array_agg(c) INTO unseen FROM generate_series(0,51)c WHERE NOT c=ANY(hand_i||choices_i);
 FOR candidate IN 0..2 LOOP
  total_i:=0;
  FOR trial IN 1..48 LOOP
   sample_i:=hand_i||choices_i[candidate+1];
   pool:=unseen;
   -- Hypothetical continuation can retain the two visible unchosen cards.
   FOR draw_i IN cardinality(sample_i)+1..5 LOOP
    key_i:=(hashtextextended(concat_ws(':','race-poker-bot/1',hand_i::text,choices_i::text,trial,draw_i),0) & 9223372036854775807);
    j:=1+(key_i%cardinality(pool))::integer;chosen:=pool[j];best_value:=-1;
    FOR other IN 1..3 LOOP
     IF other=candidate+1 OR choices_i[other]=ANY(sample_i) THEN CONTINUE;END IF;
     SELECT count(*) INTO count_i FROM unnest(sample_i)c WHERE c%13=choices_i[other]%13;
     value_i:=count_i*100+choices_i[other]%13;
     IF value_i>best_value THEN best_value:=value_i;chosen:=choices_i[other];END IF;
    END LOOP;
    SELECT count(*) INTO count_i FROM unnest(sample_i)c WHERE c%13=pool[j]%13;
    IF count_i*100+pool[j]%13>best_value THEN chosen:=pool[j];END IF;
    sample_i:=sample_i||chosen;pool:=array_remove(pool,chosen);
   END LOOP;
   total_i:=total_i+(private.race_poker_score(sample_i)->>'points')::integer;
  END LOOP;
  IF total_i>best THEN best:=total_i;best_i:=candidate;END IF;
 END LOOP;
 RETURN best_i;
END $$;

DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'race_poker_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;

-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.race_poker_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false, fake_qualified boolean NOT NULL DEFAULT false, real_qualified boolean NOT NULL DEFAULT false);
INSERT INTO private.race_poker_release DEFAULT VALUES;
ALTER TABLE private.race_poker_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.race_poker_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.race_poker_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint, bot_due_at bigint, real_money boolean NOT NULL DEFAULT false,

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX race_poker_matches_session ON private.race_poker_matches(game_id);
CREATE INDEX race_poker_matches_pending ON private.race_poker_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.race_poker_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.race_poker_matches(dealer_game_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL, receipt jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.race_poker_history (
 dealer_game_id uuid NOT NULL REFERENCES private.race_poker_matches(dealer_game_id) ON DELETE CASCADE,
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.race_poker_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.race_poker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.race_poker_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.race_poker_matches,private.race_poker_requests,private.race_poker_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.race_poker_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.race_poker_matches(dealer_game_id) ON DELETE CASCADE,
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.race_poker_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.race_poker_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.race_poker_revisions TO authenticated;
CREATE POLICY race_poker_member_read ON public.race_poker_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=race_poker_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE OR REPLACE FUNCTION private.race_poker_actor_allowed(actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND enabled)
$function$
;
CREATE OR REPLACE FUNCTION public.race_poker_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.race_poker_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.race_poker_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.race_poker_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.race_poker_history VALUES(NEW.dealer_game_id,NEW.revision,private.race_poker_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.race_poker_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'race_poker:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='race_poker_terminal';
 RETURN private.race_poker_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_history(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.race_poker_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.race_poker_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'race-poker' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.stake IS DISTINCT FROM (SELECT (config->>'ante_amount')::integer FROM public.dealer_games WHERE id=m.dealer_game_id) OR g.real_money IS DISTINCT FROM m.real_money
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'race_poker:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'race_poker:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'race_poker_terminal','race-poker',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Race Poker: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.race_poker_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements','{}'::jsonb)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Race Poker complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.race_poker_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'race-poker' THEN RAISE EXCEPTION 'race_poker:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'race_poker:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'race_poker:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'race_poker:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'race_poker:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'race_poker:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'race_poker:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.race_poker_actor_allowed(user_id)) THEN RAISE EXCEPTION 'race_poker:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'race_poker:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) <>2 THEN RAISE EXCEPTION 'race_poker:player_count';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'race_poker:money_mode_closed';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'race_poker:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'race-poker',jsonb_build_object('ante_amount',stake_i,'rules',private.race_poker_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='race-poker',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'race_poker:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'race-poker' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'race_poker:close_identity';END IF;
 IF g.status<>'session_ended' THEN
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false WHERE game_id=m.game_id;
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL)<2 THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT array_agg(position ORDER BY position DESC) INTO positions FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL AND NOT is_bot;
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='race_poker_terminal';
    SELECT position INTO next_seat FROM public.players WHERE id=winner AND game_id=m.game_id AND NOT is_bot AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
    IF next_seat IS NULL THEN IF cardinality(positions)=1 THEN next_seat:=positions[1];ELSE target:='dealer_selection';END IF;END IF;
   END IF;
   IF target IS NULL THEN
    IF next_seat IS NULL THEN SELECT max(p) INTO next_seat FROM unnest(positions) p WHERE p<g.dealer_position;next_seat:=coalesce(next_seat,positions[1]);END IF;
    target:=CASE WHEN next_seat IS NULL THEN 'dealer_selection' ELSE 'game_selection' END;
   END IF;
  END IF;
  UPDATE public.games SET status=target,game_type=CASE WHEN target='session_ended' THEN game_type END,
   current_game_uuid=NULL,config_complete=false,current_round=NULL,total_hands=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
   last_round_result=NULL,awaiting_next_round=false,next_round_number=NULL,game_over_at=NULL,pot=0,
   ante_decision_deadline=NULL,buck_position=NULL,is_first_hand=false,dealer_selection_state=NULL,
   dealer_position=coalesce(next_seat,dealer_position),config_deadline=CASE WHEN target='game_selection' THEN clock_timestamp()+make_interval(secs=>greatest(1,game_setup_timer_seconds)) END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=m.game_id;
 END IF;
 UPDATE private.race_poker_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_close(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.race_poker_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'race_poker:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.race_poker_finish_postgame(p_dealer_game_id);END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'race-poker' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.race_poker_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.race_poker_matches SET state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $function$
;
-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'race_poker_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.race_poker_capabilities(uuid),public.race_poker_snapshot(uuid),public.race_poker_history(uuid),public.race_poker_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.race_poker_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.race_poker_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.race_poker_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER race_poker_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='race-poker') EXECUTE FUNCTION private.race_poker_pause();

CREATE TRIGGER race_poker_publish AFTER INSERT OR UPDATE ON private.race_poker_matches FOR EACH ROW EXECUTE FUNCTION private.race_poker_publish();

-- All mutation callers enter this executor. Private EXECUTE is revoked; only
-- the authenticated wrapper and the database recovery owner may call it.
CREATE OR REPLACE FUNCTION private.race_poker_execute(
 dealer uuid,request uuid,expected bigint,actor uuid,action text,items integer[],caller text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.race_poker_matches;g public.games;prior private.race_poker_requests;
 command jsonb:=jsonb_build_object('revision',expected,'action',action,'items',items,'caller',caller);
 at_ms bigint;receipt_i jsonb;member jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'race_poker:participant_required' USING ERRCODE='42501';END IF;
 IF request IS NULL OR expected IS NULL OR caller NOT IN('human','bot','recovery') THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer FOR UPDATE;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 SELECT value INTO member FROM jsonb_array_elements(m.state->'players')p WHERE p->>'id'=actor::text;
 IF member IS NULL THEN RAISE EXCEPTION 'race_poker:participant_required' USING ERRCODE='42501';END IF;
 IF caller='human' AND (coalesce((member->>'isBot')::boolean,false) OR auth.uid() IS DISTINCT FROM (member->>'userId')::uuid
  OR NOT private.race_poker_actor_allowed(auth.uid())) THEN RAISE EXCEPTION 'race_poker:participant_required' USING ERRCODE='42501';END IF;
 IF caller='bot' AND NOT coalesce((member->>'isBot')::boolean,false) THEN RAISE EXCEPTION 'race_poker:bot_required';END IF;
 IF (caller='recovery' AND action<>'tick') OR (caller<>'recovery' AND action<>'choose') THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 SELECT * INTO prior FROM private.race_poker_requests WHERE dealer_game_id=dealer AND request_id=request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM actor OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'race_poker:replay_conflict';END IF;
  RETURN prior.receipt;
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM dealer OR g.game_type IS DISTINCT FROM 'race-poker' OR g.status<>'in_progress' OR m.finished OR g.is_paused OR m.paused_at IS NOT NULL THEN RAISE EXCEPTION 'race_poker:inactive';END IF;
 IF m.revision<>expected THEN RAISE EXCEPTION 'race_poker:stale_revision';END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'race_poker:spectator' USING ERRCODE='42501';END IF;
 IF caller='bot' AND (m.bot_due_at IS NULL OR m.bot_due_at>at_ms) THEN RAISE EXCEPTION 'race_poker:bot_not_due';END IF;
 m.state:=private.race_poker_reduce(m.state,action,items,at_ms);
 UPDATE private.race_poker_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=dealer RETURNING * INTO m;
 IF m.state->>'phase'='complete' THEN
  PERFORM private.race_poker_settle(dealer);
  SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
 END IF;
 receipt_i:=jsonb_build_object('requestId',request,'dealerGameId',dealer,'revision',m.revision,'committedAt',at_ms,'frame',private.race_poker_visible(m.state));
 INSERT INTO private.race_poker_requests(dealer_game_id,request_id,actor,command,receipt) VALUES(dealer,request,actor,command,receipt_i);
 RETURN receipt_i;
END $$;

CREATE OR REPLACE FUNCTION public.race_poker_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 SELECT (p->>'id')::uuid INTO actor FROM private.race_poker_matches m CROSS JOIN LATERAL jsonb_array_elements(m.state->'players')p
 WHERE m.dealer_game_id=p_dealer_game_id AND p->>'userId'=auth.uid()::text AND NOT (p->>'isBot')::boolean;
 RETURN private.race_poker_execute(p_dealer_game_id,p_request_id,p_revision,actor,p_action,p_items,'human');
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_schedule_bot() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL OR NEW.state->>'phase'<>'playing'
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_recover() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE work record;m private.race_poker_matches;at_ms bigint;actor uuid;action_i text;items_i integer[];request_i uuid;n integer:=0;i integer;v jsonb;
BEGIN
 FOR work IN SELECT dealer_game_id,round_id,game_id FROM private.race_poker_matches
  WHERE NOT finished AND paused_at IS NULL AND
   (least((state->>'deadline')::bigint,bot_due_at)<=floor(extract(epoch FROM clock_timestamp())*1000)
    OR settlement IS NOT NULL) ORDER BY dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=work.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  PERFORM 1 FROM public.games WHERE id=work.game_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=work.dealer_game_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  IF m.paused_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=m.game_id AND current_game_uuid=m.dealer_game_id AND NOT is_paused) THEN CONTINUE;END IF;
  FOR i IN 1..64 LOOP
   IF m.settlement IS NOT NULL THEN PERFORM private.race_poker_finish_postgame(m.dealer_game_id);EXIT;END IF;
   at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
   actor:=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid;
   IF (m.state->>'deadline')::bigint<=at_ms THEN action_i:='tick';items_i:=NULL;
   ELSIF m.bot_due_at<=at_ms THEN
    -- Snapshot the allowed information before strategy. This function cannot
    -- receive the real hidden deck, even indirectly.
    v:=private.race_poker_visible(m.state);
    items_i:=ARRAY[private.race_poker_bot_choice(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v->'hand')),ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v->'choices')))];
    action_i:='choose';
   ELSE EXIT;END IF;
   request_i:=md5(concat_ws(':','race-poker/1',m.dealer_game_id,m.revision,action_i))::uuid;
   BEGIN
    PERFORM private.race_poker_execute(m.dealer_game_id,request_i,m.revision,actor,action_i,items_i,CASE WHEN action_i='tick' THEN 'recovery' ELSE 'bot' END);
   EXCEPTION WHEN OTHERS THEN
    -- Policy evaluation can cross the deadline while holding the lock. Let the
    -- same executor adjudicate timeout; do not abort earlier recovered work.
    IF action_i<>'choose' OR SQLERRM<>'race_poker:deadline' THEN RAISE;END IF;
    request_i:=md5(concat_ws(':','race-poker/1',m.dealer_game_id,m.revision,'tick'))::uuid;
    PERFORM private.race_poker_execute(m.dealer_game_id,request_i,m.revision,actor,'tick',NULL,'recovery');
   END;
   SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=m.dealer_game_id;
   n:=n+1;
  END LOOP;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_immutable_match() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.dealer_game_id IS DISTINCT FROM OLD.dealer_game_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
  OR NEW.stake IS DISTINCT FROM OLD.stake OR NEW.real_money IS DISTINCT FROM OLD.real_money
  OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules' OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players'
  OR NEW.state->'identity' IS DISTINCT FROM OLD.state->'identity' OR NEW.state->'botPolicy' IS DISTINCT FROM OLD.state->'botPolicy' THEN RAISE EXCEPTION 'race_poker:configuration_frozen';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER race_poker_immutable_match BEFORE UPDATE ON private.race_poker_matches FOR EACH ROW EXECUTE FUNCTION private.race_poker_immutable_match();
CREATE TRIGGER race_poker_bot_schedule BEFORE INSERT OR UPDATE ON private.race_poker_matches FOR EACH ROW EXECUTE FUNCTION private.race_poker_schedule_bot();
REVOKE ALL ON FUNCTION private.race_poker_execute(uuid,uuid,bigint,uuid,text,integer[],text),private.race_poker_schedule_bot(),private.race_poker_recover(),private.race_poker_immutable_match(),public.race_poker_action(uuid,uuid,bigint,text,integer[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.race_poker_action(uuid,uuid,bigint,text,integer[]) TO authenticated;

-- Extend the inspected current Boxdrop registration; guard deployed hashes before applying.
CREATE OR REPLACE FUNCTION private.megatouch_begin(p_game uuid, p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games;dg public.dealer_games;r uuid:=gen_random_uuid();people jsonb;balances jsonb;s jsonb;stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type IN('run21','trip-flip','boxdrop','race-poker') THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
 IF g.game_type='eleven-up' AND EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 PERFORM set_config('app.cribbage_authoritative_write','on',true);PERFORM set_config('app.gin_rummy_authoritative_write','on',true);PERFORM set_config('app.three_five_seven_authoritative_write','on',true);PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 IF g.game_type='run21' THEN
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds)
  VALUES(p_dealer,p_game,r,people,stake_i,balances,balances,2,g.real_money,(dg.config->>'first_placement_seconds')::integer);
 ELSE
  s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'players',people,'rules',dg.config->'rules','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
  IF g.game_type='race-poker' THEN
   IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND enabled AND admission_enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'race_poker:admission_closed';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'race_poker:human_required';END IF;
   s:=private.race_poker_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.race_poker_matches(dealer_game_id,game_id,round_id,state,stake,real_money) VALUES(p_dealer,p_game,r,s,stake_i,g.real_money);
  ELSIF g.game_type='boxdrop' THEN
   s:=private.boxdrop_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.boxdrop_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='trip-flip' THEN
   s:=private.trip_flip_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.trip_flip_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='take-two' THEN
   s:=private.take_two_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.take_two_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='royal-flash' THEN
   s:=private.royal_flash_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.royal_flash_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='eleven-up' THEN
   s:=private.eleven_up_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSE
   s:=private.tri_towers_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  END IF;
 END IF;
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $function$
;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(v_game.id,v_game.current_game_uuid,NULL,'start'); END IF;
  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker') THEN
      SELECT private.megatouch_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN
      SELECT private.farkle_begin_v1(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.megatouch_frozen_stake()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF OLD.game_type IN('eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $function$
;

-- Admission stays closed. Qualification and explicit release activation are separate.
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
 VALUES('race-poker','fullscreen',5,false,'none','none',false,false,false,0,0) ON CONFLICT(game_type) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_poker_revisions;
SELECT cron.schedule('race-poker-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.race_poker_recover()$job$);
