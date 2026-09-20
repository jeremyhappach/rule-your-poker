-- Farkle Wave 1. No production numeric scoring defaults are seeded here.
-- Candidate SQL: migrate only after the complete rollback/recovery proof passes.
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS farkle_state jsonb;
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS farkle_rules jsonb;

CREATE TABLE IF NOT EXISTS private.farkle_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  admin_only boolean NOT NULL DEFAULT true,
  creation_enabled boolean NOT NULL DEFAULT false,
  production_defaults_approved boolean NOT NULL DEFAULT false
);
INSERT INTO private.farkle_release(singleton) VALUES(true) ON CONFLICT DO NOTHING;
REVOKE ALL ON private.farkle_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS private.farkle_action_receipts (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(round_id,request_id)
);
CREATE TABLE IF NOT EXISTS private.farkle_events (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id),
  event_version integer NOT NULL DEFAULT 1 CHECK(event_version=1),
  actor_id uuid,
  events jsonb NOT NULL,
  state_after jsonb NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(round_id,sequence)
);
REVOKE ALL ON private.farkle_action_receipts,private.farkle_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_validate_rules_v1(r jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE k text; n integer; v jsonb;
BEGIN
 IF r IS NULL OR jsonb_typeof(r)<>'object' OR r->>'version' IS DISTINCT FROM '1'
 OR jsonb_typeof(r->'singles') IS DISTINCT FROM 'object'
 OR jsonb_typeof(r->'ofAKind') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'farkle:invalid_rules_version'; END IF;
 IF (r - ARRAY['version','singles','ofAKind','straight','threePairs','twoTriplets','fourPlusPair'])<>'{}'::jsonb
 OR ((r->'singles') - ARRAY['1','5'])<>'{}'::jsonb
 OR ((r->'ofAKind') - ARRAY['3','4','5','6'])<>'{}'::jsonb THEN RAISE EXCEPTION 'farkle:unknown_rule'; END IF;
 FOREACH k IN ARRAY ARRAY['1','5'] LOOP
  v:=r->'singles'->k;
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR v::text !~ '^[0-9]+$' OR v::numeric>1000000 THEN RAISE EXCEPTION 'farkle:invalid_single'; END IF;
 END LOOP;
 FOR n IN 3..6 LOOP
  v:=r->'ofAKind'->n::text;
  IF jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v)<>6 THEN RAISE EXCEPTION 'farkle:invalid_kind'; END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(v) LOOP
   IF jsonb_typeof(v)<>'number' OR v::text !~ '^[0-9]+$' OR v::numeric>1000000 THEN RAISE EXCEPTION 'farkle:invalid_kind_score'; END IF;
  END LOOP;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['straight','threePairs','twoTriplets','fourPlusPair'] LOOP
  v:=r->k;
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR v::text !~ '^[0-9]+$' OR v::numeric>1000000 THEN RAISE EXCEPTION 'farkle:invalid_combo'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM jsonb_each_text(r->'singles') WHERE value::integer>0)
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(r->'ofAKind') a CROSS JOIN LATERAL jsonb_array_elements_text(a.value) b WHERE b.value::integer>0)
 AND greatest((r->>'straight')::integer,(r->>'threePairs')::integer,(r->>'twoTriplets')::integer,(r->>'fourPlusPair')::integer)=0
 THEN RAISE EXCEPTION 'farkle:no_scoring_rules'; END IF;
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_primitive_score_v1(d integer[],r jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE c integer[]:=array_fill(0,ARRAY[6]); v integer; n integer:=cardinality(d); score integer:=0; counts integer[];
BEGIN
 FOREACH v IN ARRAY d LOOP c[v]:=c[v]+1; END LOOP;
 IF n=1 AND d[1] IN (1,5) THEN score:=(r->'singles'->>d[1]::text)::integer; END IF;
 IF n BETWEEN 3 AND 6 AND c[d[1]]=n THEN score:=greatest(score,(r->'ofAKind'->n::text->>(d[1]-1))::integer); END IF;
 IF n=6 THEN
  SELECT array_agg(x ORDER BY x) INTO counts FROM unnest(c) x WHERE x>0;
  IF counts=ARRAY[1,1,1,1,1,1] THEN score:=greatest(score,(r->>'straight')::integer); END IF;
  IF counts=ARRAY[2,2,2] THEN score:=greatest(score,(r->>'threePairs')::integer); END IF;
  IF counts=ARRAY[3,3] THEN score:=greatest(score,(r->>'twoTriplets')::integer); END IF;
  IF counts=ARRAY[2,4] THEN score:=greatest(score,(r->>'fourPlusPair')::integer); END IF;
 END IF;
 RETURN score;
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_score_v1(d integer[],r jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE n integer:=cardinality(d); mask integer; sub integer; i integer; value integer; selected integer[];
 dp integer[]; primitive integer[];
BEGIN
 PERFORM private.farkle_validate_rules_v1(r);
 IF n IS NULL OR n NOT BETWEEN 1 AND 6 OR EXISTS(SELECT 1 FROM unnest(d) v WHERE v IS NULL OR v NOT BETWEEN 1 AND 6)
 THEN RAISE EXCEPTION 'farkle:invalid_scoring_dice'; END IF;
 dp:=array_fill(-1,ARRAY[1<<n],ARRAY[0]); primitive:=dp; dp[0]:=0;
 FOR mask IN 1..(1<<n)-1 LOOP
  selected:=ARRAY[]::integer[];
  FOR i IN 0..n-1 LOOP IF (mask & (1<<i))<>0 THEN selected:=array_append(selected,d[i+1]); END IF; END LOOP;
  primitive[mask]:=private.farkle_primitive_score_v1(selected,r);
  sub:=mask;
  WHILE sub>0 LOOP
   IF primitive[sub]>0 AND dp[mask # sub]>=0 THEN dp[mask]:=greatest(dp[mask],primitive[sub]+dp[mask # sub]); END IF;
   sub:=(sub-1) & mask;
  END LOOP;
 END LOOP;
 RETURN greatest(0,dp[(1<<n)-1]);
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_legal_holds_v1(d jsonb,r jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE mask integer; i integer; n integer:=jsonb_array_length(d); values integer[]; indexes jsonb; points integer; legal jsonb:='[]';
BEGIN
 IF n NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'farkle:invalid_roll'; END IF;
 FOR mask IN 1..(1<<n)-1 LOOP
  values:=ARRAY[]::integer[]; indexes:='[]';
  FOR i IN 0..n-1 LOOP IF (mask & (1<<i))<>0 THEN
   values:=array_append(values,(d->i->>'value')::integer); indexes:=indexes||jsonb_build_array(d->i->'index');
  END IF; END LOOP;
  points:=private.farkle_score_v1(values,r);
  IF points>0 THEN legal:=legal||jsonb_build_array(jsonb_build_object('indexes',indexes,'points',points)); END IF;
 END LOOP;
 RETURN legal;
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_new_state_v1(order_ids jsonb,config jsonb,round_id uuid)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE players jsonb:='{}'; id text;
BEGIN
 IF jsonb_array_length(order_ids)<2 OR jsonb_array_length(order_ids)>7
 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(order_ids))<>jsonb_array_length(order_ids)
 THEN RAISE EXCEPTION 'farkle:invalid_roster'; END IF;
 PERFORM private.farkle_validate_rules_v1(config->'rules');
 FOR id IN SELECT jsonb_array_elements_text(order_ids) LOOP
  PERFORM id::uuid;
  players:=players||jsonb_build_object(id,jsonb_build_object('banked',0,'completedTurns',0));
 END LOOP;
 RETURN jsonb_build_object('version',1,'scoringVersion',1,'_authorityScope',round_id,'actionSequence',0,
  'gamePhase','playing','turnOrder',order_ids,'eligible',order_ids,'playerStates',players,
  'currentTurnPlayerId',order_ids->0,'stage','roll','thisTurn',0,'available',jsonb_build_array(0,1,2,3,4,5),
  'dice','[]'::jsonb,'legalHolds','[]'::jsonb,'rollNumber',0,'scoringCycle',1,
  'finalQueue',NULL,'targetReachedBy',NULL,'tiebreakTurn',0,'winnerPlayerId',NULL,'config',config);
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_finish_turn_v1(s jsonb,bank boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE actor text:=s->>'currentTurnPlayerId'; p jsonb:=s->'playerStates'->actor; config jsonb:=s->'config';
 order_ids jsonb:=s->'turnOrder'; queue jsonb:=s->'finalQueue'; ids jsonb; leaders jsonb; high bigint;
 idx integer; i integer; n integer:=jsonb_array_length(order_ids); next_id text; events jsonb:=s->'events';
BEGIN
 IF bank THEN p:=jsonb_set(p,'{banked}',to_jsonb((p->>'banked')::bigint+(s->>'thisTurn')::bigint)); END IF;
 p:=jsonb_set(p,'{completedTurns}',to_jsonb((p->>'completedTurns')::integer+1));
 s:=jsonb_set(s,ARRAY['playerStates',actor],p);
 events:=events||jsonb_build_array(jsonb_build_object('type','turn_completed','playerId',actor,'completedTurns',p->'completedTurns','banked',p->'banked'));
 SELECT ordinality::integer-1 INTO idx FROM jsonb_array_elements_text(order_ids) WITH ORDINALITY WHERE value=actor;
 IF queue<>'null'::jsonb THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'farkle:final_actor_mismatch'; END IF;
  queue:=queue-0;
 ELSIF bank AND (p->>'banked')::bigint >= (config->>'targetScore')::bigint THEN
  s:=jsonb_set(s,'{targetReachedBy}',to_jsonb(actor)); queue:='[]';
  events:=events||jsonb_build_array(jsonb_build_object('type','target_reached','playerId',actor,'endgame',config->'endgame'));
  IF config->>'endgame'='equal_turns' THEN
   FOR i IN idx+1..n-1 LOOP queue:=queue||jsonb_build_array(order_ids->i); END LOOP;
  ELSIF config->>'endgame'='one_last_turn' THEN
   FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(order_ids->((idx+i)%n)); END LOOP;
  ELSIF config->>'endgame'<>'immediate' THEN RAISE EXCEPTION 'farkle:unknown_endgame'; END IF;
 END IF;
 IF queue='[]'::jsonb THEN
  ids:=s->'eligible';
  SELECT max((s->'playerStates'->value->>'banked')::bigint) INTO high FROM jsonb_array_elements_text(ids);
  SELECT jsonb_agg(value ORDER BY ordinality) INTO leaders FROM jsonb_array_elements_text(ids) WITH ORDINALITY
   WHERE (s->'playerStates'->value->>'banked')::bigint=high;
  IF jsonb_array_length(leaders)=1 THEN
   s:=s||jsonb_build_object('gamePhase','complete','winnerPlayerId',leaders->0,'currentTurnPlayerId',NULL);
   events:=events||jsonb_build_array(jsonb_build_object('type','terminal_result','winnerPlayerId',leaders->0,'scores',s->'playerStates'));
  ELSE
   queue:=leaders;
   s:=s||jsonb_build_object('eligible',leaders,'tiebreakTurn',(s->>'tiebreakTurn')::integer+1);
   events:=events||jsonb_build_array(jsonb_build_object('type','tiebreak_started','players',leaders,'tiebreakTurn',s->'tiebreakTurn'));
  END IF;
 END IF;
 s:=s||jsonb_build_object('thisTurn',0,'stage','roll','dice','[]'::jsonb,'legalHolds','[]'::jsonb,
   'available',jsonb_build_array(0,1,2,3,4,5),'rollNumber',0,'scoringCycle',1,'finalQueue',queue);
 IF s->>'gamePhase'='playing' THEN
  next_id:=CASE WHEN queue<>'null'::jsonb THEN queue->>0 ELSE order_ids->>((idx+1)%n) END;
  s:=jsonb_set(s,'{currentTurnPlayerId}',to_jsonb(next_id));
  events:=events||jsonb_build_array(jsonb_build_object('type','turn_started','playerId',next_id,
    'turnNumber',(s->'playerStates'->next_id->>'completedTurns')::integer+1,'tiebreakTurn',s->'tiebreakTurn','finalQueue',queue));
 END IF;
 RETURN s||jsonb_build_object('events',events);
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_reduce_v1(s jsonb,action text,selection jsonb,rolled integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE config jsonb:=s->'config'; dice jsonb:='[]'; legal jsonb; hold jsonb; available jsonb; i integer; event jsonb;
BEGIN
 IF s->>'version' IS DISTINCT FROM '1' OR s->>'gamePhase' IS DISTINCT FROM 'playing' THEN RAISE EXCEPTION 'farkle:not_playing'; END IF;
 s:=s||jsonb_build_object('events','[]'::jsonb,'actionSequence',(s->>'actionSequence')::bigint+1);
 IF action='roll' THEN
  IF s->>'stage' NOT IN ('roll','bank_or_roll') OR cardinality(rolled) IS DISTINCT FROM jsonb_array_length(s->'available')
  OR EXISTS(SELECT 1 FROM unnest(rolled) v WHERE v IS NULL OR v NOT BETWEEN 1 AND 6)
  THEN RAISE EXCEPTION 'farkle:illegal_roll'; END IF;
  FOR i IN 0..cardinality(rolled)-1 LOOP dice:=dice||jsonb_build_array(jsonb_build_object('index',s->'available'->i,'value',rolled[i+1])); END LOOP;
  legal:=private.farkle_legal_holds_v1(dice,config->'rules');
  event:=jsonb_build_object('type','dice_rolled','playerId',s->'currentTurnPlayerId','dice',dice,'rollNumber',(s->>'rollNumber')::integer+1,'scoringCycle',s->'scoringCycle');
  s:=s||jsonb_build_object('dice',dice,'legalHolds',legal,'rollNumber',(s->>'rollNumber')::integer+1,'stage','hold','events',jsonb_build_array(event));
  IF legal='[]'::jsonb THEN
   s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','farkle','playerId',s->'currentTurnPlayerId','lost',s->'thisTurn')));
   s:=private.farkle_finish_turn_v1(s,false);
  END IF;
 ELSIF action='hold' THEN
  IF s->>'stage'<>'hold' OR jsonb_typeof(selection) IS DISTINCT FROM 'array' OR jsonb_array_length(selection)=0
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection) v WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[0-5]$')
  OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(selection))<>jsonb_array_length(selection)
  THEN RAISE EXCEPTION 'farkle:illegal_hold'; END IF;
  SELECT jsonb_agg(value::integer ORDER BY value::integer) INTO selection FROM jsonb_array_elements_text(selection);
  SELECT value INTO hold FROM jsonb_array_elements(s->'legalHolds') WHERE value->'indexes'=selection;
  IF hold IS NULL THEN RAISE EXCEPTION 'farkle:non_scoring_selection'; END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO available FROM jsonb_array_elements(s->'available') WITH ORDINALITY WHERE NOT selection @> jsonb_build_array(value);
  s:=s||jsonb_build_object('thisTurn',(s->>'thisTurn')::bigint+(hold->>'points')::bigint,'available',available,'stage','bank_or_roll','legalHolds','[]'::jsonb);
  event:=jsonb_build_object('type','dice_held','playerId',s->'currentTurnPlayerId','indexes',selection,'points',hold->'points','thisTurn',s->'thisTurn','rollNumber',s->'rollNumber');
  s:=jsonb_set(s,'{events}',jsonb_build_array(event));
  IF available='[]'::jsonb THEN
   s:=s||jsonb_build_object('available',jsonb_build_array(0,1,2,3,4,5),'scoringCycle',(s->>'scoringCycle')::integer+1);
   s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','hot_dice','thisTurn',s->'thisTurn','scoringCycle',s->'scoringCycle')));
  END IF;
 ELSIF action='bank' THEN
  IF s->>'stage'<>'bank_or_roll' OR (s->>'thisTurn')::bigint<=0 THEN RAISE EXCEPTION 'farkle:illegal_bank'; END IF;
  s:=jsonb_set(s,'{events}',jsonb_build_array(jsonb_build_object('type','banked','playerId',s->'currentTurnPlayerId','points',s->'thisTurn')));
  s:=private.farkle_finish_turn_v1(s,true);
 ELSE RAISE EXCEPTION 'farkle:unknown_action'; END IF;
 RETURN s;
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_config_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.game_type='farkle' AND EXISTS(SELECT 1 FROM public.games WHERE id=OLD.session_id)
  THEN RAISE EXCEPTION 'farkle:frozen_config_immutable' USING ERRCODE='55000'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.game_type='farkle' OR NEW.game_type='farkle')
 AND ROW(OLD.id,OLD.session_id,OLD.dealer_user_id,OLD.game_type,OLD.config)
 IS DISTINCT FROM ROW(NEW.id,NEW.session_id,NEW.dealer_user_id,NEW.game_type,NEW.config)
 THEN RAISE EXCEPTION 'farkle:frozen_config_immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' AND NEW.game_type='farkle' THEN
  PERFORM pg_advisory_xact_lock_shared(19092026,1);
  PERFORM private.farkle_require_claim_v1(NEW.session_id);
  IF coalesce((NEW.config->>'testOnly')::boolean,false) AND (EXISTS(SELECT 1 FROM public.games WHERE id=NEW.session_id AND real_money)
   OR (coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role))))
  THEN RAISE EXCEPTION 'farkle:test_config_admin_fake_only' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND creation_enabled
   AND (NOT admin_only OR coalesce(auth.jwt()->>'role','')='service_role' OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin'::public.app_role))))
  THEN RAISE EXCEPTION 'farkle:admin_creation_required' USING ERRCODE='42501'; END IF;
  PERFORM private.farkle_validate_rules_v1(NEW.config->'rules');
  IF NEW.config->>'version' IS DISTINCT FROM '1' OR coalesce(NEW.config->>'endgame','') NOT IN ('immediate','equal_turns','one_last_turn')
  OR coalesce(NEW.config->>'targetScore','') !~ '^[1-9][0-9]*$' OR (NEW.config->>'targetScore')::bigint>1000000000
  OR coalesce(NEW.config->>'ante_amount','') !~ '^[1-9][0-9]*$' OR (NEW.config->>'ante_amount')::bigint>1000000
  OR coalesce(NEW.config->>'turnSeconds','') !~ '^[1-9][0-9]*$'
  OR coalesce(NEW.config->>'botDelayMs','') !~ '^[1-9][0-9]*$'
  OR coalesce(NEW.config->>'botBankThreshold','') !~ '^[1-9][0-9]*$'
  OR coalesce(NEW.config->>'botPolicy','') <> 'balanced'
  THEN RAISE EXCEPTION 'farkle:invalid_frozen_config'; END IF;
 END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.games WHERE id=NEW.session_id AND game_type='farkle') THEN
  PERFORM private.farkle_require_claim_v1(NEW.session_id);
 END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS farkle_frozen_config ON public.dealer_games;
CREATE TRIGGER farkle_frozen_config BEFORE INSERT OR UPDATE OR DELETE ON public.dealer_games FOR EACH ROW EXECUTE FUNCTION private.farkle_config_guard_v1();

CREATE OR REPLACE FUNCTION private.farkle_begin_v1(p_game_id uuid,p_dealer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); g public.games; d public.dealer_games; r public.rounds; order_ids jsonb; s jsonb; round_id uuid:=gen_random_uuid(); first_bot boolean;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'farkle' OR g.current_game_uuid IS DISTINCT FROM p_dealer_id THEN RAISE EXCEPTION 'farkle:wrong_game'; END IF;
 SELECT * INTO d FROM public.dealer_games WHERE id=p_dealer_id AND session_id=p_game_id AND game_type='farkle';
 IF NOT FOUND THEN RAISE EXCEPTION 'farkle:missing_config'; END IF;
 SELECT * INTO r FROM public.rounds WHERE game_id=g.id AND dealer_game_id=d.id ORDER BY hand_number LIMIT 1;
 IF FOUND THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','already_started','round_id',r.id,'state',r.farkle_state); END IF;
 IF g.status<>'ante_decision' OR g.is_paused THEN RAISE EXCEPTION 'farkle:cannot_start'; END IF;
 SELECT jsonb_agg(id ORDER BY (g.dealer_position-position+7)%7=0,(g.dealer_position-position+7)%7,id) INTO order_ids
 FROM public.players WHERE game_id=g.id AND ante_decision='ante_up' AND NOT coalesce(sitting_out,false) AND status NOT IN ('left','observer') AND position IS NOT NULL;
 s:=private.farkle_new_state_v1(order_ids,d.config,round_id);
 SELECT is_bot OR auto_fold INTO first_bot FROM public.players WHERE id=(order_ids->>0)::uuid;
 s:=s||jsonb_build_object('turnDeadline',clock_timestamp()+make_interval(secs=>CASE WHEN first_bot THEN (d.config->>'botDelayMs')::numeric/1000 ELSE (d.config->>'turnSeconds')::numeric END));
 PERFORM private.farkle_claim_v1(g.id,d.id,round_id,'start');
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot,farkle_state)
 VALUES(round_id,g.id,d.id,1,1,0,'betting',0,s);
 UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,ante_decision_deadline=NULL,
  awaiting_next_round=false,last_round_result=NULL,game_over_at=NULL WHERE id=g.id;
 INSERT INTO private.farkle_events(round_id,sequence,dealer_game_id,actor_id,events,state_after,config_hash)
 VALUES(round_id,0,d.id,(s->>'currentTurnPlayerId')::uuid,
  jsonb_build_array(jsonb_build_object('type','game_started','config',d.config,'turnOrder',order_ids),
   jsonb_build_object('type','turn_started','playerId',s->'currentTurnPlayerId','turnNumber',1,'tiebreakTurn',0)),s,md5(d.config::text));
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','started','round_id',round_id,'state',s);
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_settle_v1(round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); r public.rounds; g public.games; d public.dealer_games; existing public.game_results; s jsonb;
 winner uuid; count_players integer; stake integer; gain integer; changes jsonb; winner_name text; result_id uuid; disposition text;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=round_id FOR UPDATE;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 SELECT * INTO d FROM public.dealer_games WHERE id=r.dealer_game_id AND session_id=r.game_id AND game_type='farkle';
 s:=r.farkle_state; winner:=(s->>'winnerPlayerId')::uuid;
 IF NOT FOUND OR s->>'gamePhase' IS DISTINCT FROM 'complete' OR winner IS NULL OR s->'config' IS DISTINCT FROM d.config
 THEN RAISE EXCEPTION 'farkle:not_settleable'; END IF;
 stake:=(d.config->>'ante_amount')::integer; count_players:=jsonb_array_length(s->'turnOrder'); gain:=stake*(count_players-1);
 SELECT jsonb_object_agg(value,CASE WHEN value::uuid=winner THEN gain ELSE -stake END) INTO changes FROM jsonb_array_elements_text(s->'turnOrder');
 SELECT * INTO existing FROM public.game_results WHERE dealer_game_id=d.id AND hand_number=r.hand_number AND settlement_key='farkle_terminal';
 IF FOUND THEN
  IF existing.winner_player_id IS DISTINCT FROM winner OR existing.player_chip_changes IS DISTINCT FROM changes OR r.status<>'completed'
  THEN RAISE EXCEPTION 'farkle:inconsistent_settlement'; END IF;
  PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','already_settled','result_id',existing.id,'winner_player_id',winner);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM d.id OR g.game_type<>'farkle' OR g.status<>'in_progress' OR g.is_paused
 OR g.current_round<>r.round_number OR g.total_hands<>r.hand_number OR g.pot<>0
 THEN RAISE EXCEPTION 'farkle:stale_settlement'; END IF;
 PERFORM private.farkle_claim_v1(g.id,d.id,r.id,'action');
 PERFORM 1 FROM public.players WHERE game_id=g.id AND s->'playerStates' ? id::text ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND s->'playerStates' ? id::text)<>count_players THEN RAISE EXCEPTION 'farkle:roster_changed'; END IF;
 SELECT coalesce(pr.username,CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player '||p.position END) INTO winner_name
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.id=winner AND p.game_id=g.id;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(g.id,d.id,r.hand_number,'farkle_terminal','farkle',winner,winner_name,'Score: '||(s->'playerStates'->winner::text->>'banked'),gain,changes,false) RETURNING id INTO result_id;
 UPDATE public.players SET chips=chips+(changes->>id::text)::integer WHERE game_id=g.id AND changes ? id::text;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=r.id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,d.id,p.id,p.user_id,coalesce(pr.username,CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player '||p.position END),p.chips,p.is_bot,r.hand_number
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=excluded.chips,user_id=excluded.user_id,username=excluded.username,is_bot=excluded.is_bot,created_at=excluded.created_at;
 disposition:=CASE WHEN g.pending_session_end THEN 'session_ended' ELSE 'game_over' END;
 UPDATE public.games SET status=disposition,pot=0,awaiting_next_round=false,last_round_result=winner_name||' wins!',game_over_at=clock_timestamp(),
  session_ended_at=CASE WHEN g.pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
  pending_session_end=CASE WHEN g.pending_session_end THEN false ELSE pending_session_end END WHERE id=g.id;
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','settled','result_id',result_id,'winner_player_id',winner,'amount_per_loser',stake,'total_winner_gain',gain,'terminal_disposition',disposition);
END $f$;

CREATE OR REPLACE FUNCTION public.farkle_apply_action(p_round_id uuid,p_player_id uuid,p_action text,p_expected_sequence bigint,p_request_id uuid,p_selection jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); r public.rounds; g public.games; p public.players; d public.dealer_games; receipt private.farkle_action_receipts;
 s jsonb; request jsonb; result jsonb; rolled integer[]; terminal jsonb; next_actor public.players; service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
 IF p_request_id IS NULL OR p_expected_sequence IS NULL OR p_action NOT IN ('roll','hold','bank') OR p_selection IS NULL
 OR (auth.uid() IS NULL AND NOT service) THEN RAISE EXCEPTION 'farkle:invalid_action_request' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR r.farkle_state IS NULL THEN RAISE EXCEPTION 'farkle:round_not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=r.game_id FOR UPDATE;
 IF NOT FOUND OR NOT (r.farkle_state->'playerStates' ? p.id::text)
 OR (NOT service AND (p.is_bot OR p.user_id IS DISTINCT FROM auth.uid())) THEN RAISE EXCEPTION 'farkle:not_authorized' USING ERRCODE='42501'; END IF;
 request:=jsonb_build_object('actor',p_player_id,'action',p_action,'expectedSequence',p_expected_sequence,'selection',p_selection);
 SELECT * INTO receipt FROM private.farkle_action_receipts WHERE round_id=r.id AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.actor_id<>p_player_id OR receipt.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'farkle:replay_payload_mismatch'; END IF;
  PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN receipt.response||jsonb_build_object('deduped',true);
 END IF;
 s:=r.farkle_state;
 IF g.game_type<>'farkle' OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id OR g.current_round<>r.round_number OR g.total_hands<>r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR s->>'gamePhase'<>'playing'
 THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_identity','state',s); END IF;
 IF g.is_paused THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','paused','state',s); END IF;
 IF (s->>'actionSequence')::bigint<>p_expected_sequence THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_action','state',s); END IF;
 IF s->>'currentTurnPlayerId'<>p.id::text OR (NOT service AND p.auto_fold) OR (service AND NOT (p.is_bot OR p.auto_fold))
 THEN RAISE EXCEPTION 'farkle:not_controller' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dealer_games WHERE id=r.dealer_game_id AND session_id=g.id AND game_type='farkle';
 IF NOT FOUND OR s->'config' IS DISTINCT FROM d.config THEN RAISE EXCEPTION 'farkle:frozen_config_mismatch'; END IF;
 IF p_action<>'hold' AND p_selection<>'[]'::jsonb THEN RAISE EXCEPTION 'farkle:unexpected_selection'; END IF;
 IF p_action='roll' THEN SELECT array_agg(private.secure_random_int(6)+1 ORDER BY i) INTO rolled FROM generate_series(1,jsonb_array_length(s->'available')) i; END IF;
 s:=private.farkle_reduce_v1(s,p_action,p_selection,rolled);
 PERFORM private.farkle_claim_v1(g.id,d.id,r.id,'action');
 -- Horses reclaim semantics: a pending request is consumed only after that
 -- player's complete turn, including a BANK, Farkle or terminal completion.
 UPDATE public.players SET auto_fold=false,auto_play_stop_round_id=NULL
 WHERE game_id=g.id AND auto_play_stop_round_id=r.id
 AND (s->>'gamePhase'<>'playing' OR s->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 IF s->>'gamePhase'='playing' THEN
  SELECT * INTO next_actor FROM public.players WHERE id=(s->>'currentTurnPlayerId')::uuid AND game_id=g.id;
  s:=jsonb_set(s,'{turnDeadline}',to_jsonb(clock_timestamp()+make_interval(secs=>CASE WHEN next_actor.is_bot OR next_actor.auto_fold
   THEN (d.config->>'botDelayMs')::numeric/1000 ELSE (d.config->>'turnSeconds')::numeric END)));
 ELSE s:=s||jsonb_build_object('turnDeadline',NULL); END IF;
 UPDATE public.rounds SET farkle_state=s WHERE id=r.id;
 IF s->>'gamePhase'='complete' THEN terminal:=private.farkle_settle_v1(r.id); END IF;
 INSERT INTO private.farkle_events(round_id,sequence,dealer_game_id,actor_id,events,state_after,config_hash)
 VALUES(r.id,(s->>'actionSequence')::bigint,d.id,p.id,s->'events',s,md5(d.config::text));
 result:=jsonb_build_object('outcome','applied','deduped',false,'action_sequence',s->'actionSequence','state',s,'settlement',terminal);
 INSERT INTO private.farkle_action_receipts(round_id,request_id,actor_id,request,response) VALUES(r.id,p_request_id,p.id,request,result);
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN result;
END $f$;
REVOKE ALL ON FUNCTION public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_bot_action_v1(s jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE best jsonb; threshold integer;
BEGIN
 IF s->>'stage'='hold' THEN
  SELECT value INTO best FROM jsonb_array_elements(s->'legalHolds')
  ORDER BY (value->>'points')::integer DESC,jsonb_array_length(value->'indexes') DESC,value->'indexes' LIMIT 1;
  IF best IS NULL THEN RAISE EXCEPTION 'farkle:bot_has_no_legal_hold'; END IF;
  RETURN jsonb_build_object('action','hold','selection',best->'indexes');
 END IF;
 -- Testable, deterministic policy. These risk thresholds are policy tuning,
 -- never scoring rules; configuration must explicitly supply them.
 threshold:=(s->'config'->>'botBankThreshold')::integer;
 IF s->>'stage'='bank_or_roll' AND ((s->>'thisTurn')::bigint>=threshold
  OR ((s->'playerStates'->(s->>'currentTurnPlayerId')->>'banked')::bigint+(s->>'thisTurn')::bigint>=(s->'config'->>'targetScore')::bigint))
 THEN RETURN jsonb_build_object('action','bank','selection','[]'::jsonb); END IF;
 RETURN jsonb_build_object('action','roll','selection','[]'::jsonb);
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_advance_due_v1(round_id uuid,now_at timestamptz DEFAULT clock_timestamp())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); r public.rounds; g public.games; p public.players; s jsonb; choice jsonb; prior jsonb:=private.capture_recovery_context(); result jsonb;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=round_id FOR UPDATE;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 s:=r.farkle_state;
 IF g.game_type IS DISTINCT FROM 'farkle' OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id OR g.status<>'in_progress'
 OR s->>'gamePhase' IS DISTINCT FROM 'playing' OR g.is_paused THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF (s->>'turnDeadline')::timestamptz>now_at THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','deadline_not_expired','deadline',s->'turnDeadline'); END IF;
 SELECT * INTO p FROM public.players WHERE id=(s->>'currentTurnPlayerId')::uuid AND game_id=g.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'farkle:missing_actor'; END IF;
 PERFORM private.farkle_claim_v1(g.id,r.dealer_game_id,r.id,'action');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 IF g.real_money AND NOT p.is_bot THEN
  -- Give the human a full decision window on resume; this changes no dice,
  -- score, turn count, bank decision or automatic-control flag.
  UPDATE public.rounds SET farkle_state=jsonb_set(s,'{turnDeadline}',to_jsonb(now_at+make_interval(secs=>(s->'config'->>'turnSeconds')::integer))) WHERE id=r.id;
  result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
 ELSE
  IF NOT p.is_bot AND NOT p.auto_fold THEN UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p.id; END IF;
  choice:=private.farkle_bot_action_v1(s);
  result:=public.farkle_apply_action(r.id,p.id,choice->>'action',(s->>'actionSequence')::bigint,gen_random_uuid(),choice->'selection');
 END IF;
 PERFORM private.restore_recovery_context(prior);
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN result;
EXCEPTION WHEN OTHERS THEN PERFORM private.restore_recovery_context(prior); RAISE;
END $f$;

CREATE OR REPLACE FUNCTION private.farkle_sync_timer_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF NEW.farkle_state IS NULL THEN RETURN NEW; END IF;
 IF NEW.status<>'completed' AND NEW.farkle_state->>'gamePhase'='playing' THEN
  PERFORM private.register_game_timer(NEW.game_id,'farkle_turn',NEW.id::text||':'||(NEW.farkle_state->>'actionSequence'),
   'canonical_timers',(NEW.farkle_state->>'turnDeadline')::timestamptz,NEW.dealer_game_id,NEW.id,NEW.hand_number,
   (NEW.farkle_state->>'currentTurnPlayerId')::uuid,NEW.farkle_state->>'stage','{}');
 ELSE PERFORM private.cancel_game_timers(NEW.game_id,'farkle_turn',NEW.id); END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS farkle_sync_timer ON public.rounds;
CREATE TRIGGER farkle_sync_timer AFTER INSERT OR UPDATE OF farkle_state,status ON public.rounds FOR EACH ROW EXECUTE FUNCTION private.farkle_sync_timer_v1();

CREATE OR REPLACE FUNCTION private.farkle_guard_round_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE r public.rounds;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF
 (r.farkle_state IS NOT NULL OR (TG_OP='UPDATE' AND OLD.farkle_state IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.dealer_games WHERE id=r.dealer_game_id AND game_type='farkle')
 OR EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND (id=r.game_id OR (TG_OP='UPDATE' AND id=OLD.game_id))))
 THEN
  PERFORM private.farkle_require_claim_v1(r.game_id,r.dealer_game_id,r.id);
  IF TG_OP='UPDATE' THEN PERFORM private.farkle_require_claim_v1(OLD.game_id,OLD.dealer_game_id,OLD.id); END IF;
 END IF;
 RETURN r;
END $f$;
DROP TRIGGER IF EXISTS farkle_guard_round ON public.rounds;
CREATE TRIGGER farkle_guard_round BEFORE INSERT OR UPDATE OR DELETE ON public.rounds FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_round_v1();

CREATE OR REPLACE FUNCTION public.farkle_read_replay(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE r public.rounds; result jsonb;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND farkle_state IS NOT NULL;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT (public.user_is_in_game(r.game_id)
 OR EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=r.game_id AND user_id=auth.uid()))
 THEN RAISE EXCEPTION 'farkle:replay_not_authorized' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('contract','farkle-replay/1','roundId',r.id,'dealerGameId',r.dealer_game_id,
  'config',(SELECT config FROM public.dealer_games WHERE id=r.dealer_game_id),
  'events',coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'actorId',actor_id,'events',events,'stateAfter',state_after,'configHash',config_hash) ORDER BY sequence),'[]'))
 INTO result FROM private.farkle_events WHERE round_id=r.id;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION public.farkle_read_replay(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.farkle_read_replay(uuid) TO authenticated;

-- No public caller may write authority tables or invoke private helpers directly.
DO $permissions$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname LIKE 'farkle_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $permissions$;
