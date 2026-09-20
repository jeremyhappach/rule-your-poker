BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='90s';
-- Exact transaction-local identity. Approved entry points restore prior claims
-- before every return; exceptions roll back the claim with their subtransaction.
CREATE OR REPLACE FUNCTION private.farkle_claim_v1(p_game_id uuid,p_dealer_id uuid,p_round_id uuid,p_operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF p_operation IS NULL OR p_operation NOT IN ('configure','start','action','pause','control','cleanup')
 OR NOT EXISTS(SELECT 1 FROM public.games g WHERE g.id=p_game_id
   AND (p_operation IN ('configure','cleanup') OR (g.game_type='farkle' AND g.current_game_uuid=p_dealer_id)))
 OR (p_round_id IS NOT NULL AND p_operation NOT IN ('start','cleanup') AND NOT EXISTS(
   SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND r.game_id=p_game_id AND r.dealer_game_id=p_dealer_id))
 THEN RAISE EXCEPTION 'farkle:invalid_authority_identity' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.farkle_authority',jsonb_build_object('game',p_game_id,'dealer',p_dealer_id,'round',p_round_id,'operation',p_operation)::text,true);
END $f$;
REVOKE ALL ON FUNCTION private.farkle_claim_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_require_claim_v1(game_id uuid,dealer_id uuid DEFAULT NULL,round_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE claim jsonb:=nullif(current_setting('app.farkle_authority',true),'')::jsonb;
BEGIN
 IF current_user IN ('anon','authenticated','service_role') OR claim IS NULL
 OR coalesce(claim->>'operation','') NOT IN ('configure','start','action','pause','control','cleanup')
 OR claim->>'game' IS DISTINCT FROM game_id::text
 OR (dealer_id IS NOT NULL AND claim->>'operation' NOT IN ('configure','cleanup') AND claim->>'dealer' IS DISTINCT FROM dealer_id::text)
 OR (round_id IS NOT NULL AND claim->>'round' IS NOT NULL AND claim->>'round' IS DISTINCT FROM round_id::text)
 THEN RAISE EXCEPTION 'farkle:authority_claim_required' USING ERRCODE='42501'; END IF;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_require_claim_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

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

-- Called only by the canonical dealer-game configuration owner.
CREATE OR REPLACE FUNCTION private.farkle_resolve_config_v1(g public.games,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE release private.farkle_release; defaults public.game_defaults; old public.dealer_games; c jsonb; rules jsonb; test_config jsonb;
BEGIN
 -- Shared with recovery; retained through dealer-game insertion and COMMIT.
 PERFORM pg_advisory_xact_lock_shared(19092026,1);
 SELECT * INTO release FROM private.farkle_release WHERE singleton;
 IF NOT coalesce(release.creation_enabled,false) THEN RAISE EXCEPTION 'farkle:creation_disabled'; END IF;
 IF NOT FOUND OR (release.admin_only AND coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role)))
 THEN RAISE EXCEPTION 'farkle:admin_only' USING ERRCODE='42501'; END IF;
 IF (input-ARRAY['ante_amount','targetScore','endgame','runBackDealerGameId','testConfiguration'])<>'{}'::jsonb THEN RAISE EXCEPTION 'farkle:unsupported_setup_field'; END IF;
 IF input ? 'runBackDealerGameId' THEN
  SELECT * INTO old FROM public.dealer_games WHERE id=(input->>'runBackDealerGameId')::uuid AND session_id=g.id AND game_type='farkle';
  IF NOT FOUND OR input ? 'testConfiguration' OR (input->>'ante_amount')::integer IS DISTINCT FROM (old.config->>'ante_amount')::integer
  OR (input ? 'targetScore' AND input->'targetScore' IS DISTINCT FROM old.config->'targetScore')
  OR (input ? 'endgame' AND input->'endgame' IS DISTINCT FROM old.config->'endgame') THEN RAISE EXCEPTION 'farkle:run_back_snapshot_mismatch'; END IF;
  IF g.real_money AND coalesce((old.config->>'testOnly')::boolean,false) THEN RAISE EXCEPTION 'farkle:test_rules_fake_money_only'; END IF;
  IF coalesce((old.config->>'testOnly')::boolean,false) AND coalesce(auth.jwt()->>'role','')<>'service_role'
   AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role)) THEN RAISE EXCEPTION 'farkle:test_config_admin_only' USING ERRCODE='42501'; END IF;
  IF NOT coalesce((old.config->>'testOnly')::boolean,false) AND NOT release.production_defaults_approved THEN RAISE EXCEPTION 'farkle:production_defaults_unapproved'; END IF;
  RETURN old.config;
 END IF;
 test_config:=input->'testConfiguration';
 IF test_config IS NOT NULL THEN
  IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role))
  THEN RAISE EXCEPTION 'farkle:test_config_admin_only' USING ERRCODE='42501'; END IF;
  IF g.real_money OR coalesce(test_config->>'label','') NOT LIKE 'TEST ONLY:%' OR coalesce((test_config->>'testOnly')::boolean,false) IS NOT TRUE
  THEN RAISE EXCEPTION 'farkle:test_rules_fake_money_only'; END IF;
  rules:=test_config->'rules';
  c:=jsonb_build_object('testOnly',true,'testLabel',test_config->'label','botPolicy',test_config->'botPolicy',
   'botBankThreshold',test_config->'botBankThreshold','turnSeconds',test_config->'turnSeconds','botDelayMs',test_config->'botDelayMs');
 ELSE
  IF NOT release.production_defaults_approved THEN RAISE EXCEPTION 'farkle:production_defaults_unapproved'; END IF;
  SELECT * INTO defaults FROM public.game_defaults WHERE game_type='farkle';
  IF NOT FOUND OR defaults.farkle_rules IS NULL THEN RAISE EXCEPTION 'farkle:missing_admin_defaults'; END IF;
  rules:=defaults.farkle_rules->'scoring';
  c:=jsonb_build_object('testOnly',false,'botPolicy',defaults.farkle_rules->'botPolicy','botBankThreshold',defaults.farkle_rules->'botBankThreshold',
   'turnSeconds',defaults.decision_timer_seconds,'botDelayMs',defaults.bot_decision_delay_seconds*1000);
 END IF;
 PERFORM private.farkle_validate_rules_v1(rules);
 IF c->>'botPolicy' IS DISTINCT FROM 'balanced' THEN RAISE EXCEPTION 'farkle:unsupported_bot_policy'; END IF;
 RETURN c||jsonb_build_object('version',1,'rules',rules,'ante_amount',(input->>'ante_amount')::integer,
  'targetScore',(input->>'targetScore')::bigint,'endgame',input->>'endgame');
END $f$;
REVOKE ALL ON FUNCTION private.farkle_resolve_config_v1(public.games,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_guard_shared_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE is_farkle boolean; row_new jsonb; row_old jsonb;
BEGIN
 row_new:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 row_old:=CASE WHEN TG_OP='INSERT' THEN row_new ELSE to_jsonb(OLD) END;
 IF TG_TABLE_NAME='games' THEN
  is_farkle:=row_new->>'game_type'='farkle' OR row_old->>'game_type'='farkle';
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND id IN ((row_new->>'game_id')::uuid,(row_old->>'game_id')::uuid)) INTO is_farkle;
 END IF;
 IF is_farkle THEN
  IF TG_TABLE_NAME='games' THEN
   PERFORM private.farkle_require_claim_v1((row_new->>'id')::uuid);
   PERFORM private.farkle_require_claim_v1((row_old->>'id')::uuid);
  ELSE
   PERFORM private.farkle_require_claim_v1((row_new->>'game_id')::uuid);
   PERFORM private.farkle_require_claim_v1((row_old->>'game_id')::uuid);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_guard_shared_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS farkle_guard_game ON public.games;
CREATE TRIGGER farkle_guard_game BEFORE INSERT OR UPDATE OR DELETE ON public.games FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_shared_v1();
DROP TRIGGER IF EXISTS farkle_guard_player ON public.players;
CREATE TRIGGER farkle_guard_player BEFORE UPDATE OF chips,auto_fold,auto_play_stop_round_id,game_id,id,user_id,is_bot ON public.players FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_shared_v1();
DROP TRIGGER IF EXISTS farkle_guard_player_roster ON public.players;
CREATE TRIGGER farkle_guard_player_roster BEFORE INSERT OR DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_shared_v1();

CREATE OR REPLACE FUNCTION private.farkle_guard_ledger_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE candidate jsonb; old_row jsonb; v_game uuid; v_dealer uuid;
BEGIN
 candidate:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_row:=CASE WHEN TG_OP='INSERT' THEN candidate ELSE to_jsonb(OLD) END;
 FOR candidate IN SELECT value FROM jsonb_array_elements(jsonb_build_array(candidate,old_row)) LOOP
  v_game:=(candidate->>'game_id')::uuid; v_dealer:=(candidate->>'dealer_game_id')::uuid;
  IF candidate->>'game_type'='farkle' OR EXISTS(SELECT 1 FROM public.dealer_games WHERE id=v_dealer AND game_type='farkle')
  OR EXISTS(SELECT 1 FROM public.games WHERE id=v_game AND game_type='farkle') THEN
   PERFORM private.farkle_require_claim_v1(v_game,v_dealer);
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_guard_ledger_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS farkle_guard_result ON public.game_results;
CREATE TRIGGER farkle_guard_result BEFORE INSERT OR UPDATE OR DELETE ON public.game_results FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_ledger_v1();
DROP TRIGGER IF EXISTS farkle_guard_snapshot ON public.session_player_snapshots;
CREATE TRIGGER farkle_guard_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION private.farkle_guard_ledger_v1();

DO $guard$ BEGIN IF md5(pg_get_functiondef('public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure)) NOT IN ('9fc99d2870622c8bb0aebe5a78e7f00f','3cd85a247c2cbcecf6f64ef05dc74052') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:configure_dealer_game'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee','farkle'
  ) THEN
    RAISE EXCEPTION 'configure_dealer_game:unsupported_game_type:%',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_config_document';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'configure_dealer_game:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.configure_dealer_game',false,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'configure_dealer_game:game_not_found'; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'configure_dealer_game:not_in_session';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_ante';
  END IF;
  v_ante := (p_config->>'ante_amount')::integer;
  v_request_hash := md5(concat_ws('|',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'configure_dealer_game:replay_payload_mismatch';
    END IF;
    v_replay_return := v_claim.result || jsonb_build_object('outcome','already_configured','deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:game_paused';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:session_ending';
  END IF;
  IF v_game.status NOT IN ('game_selection','configuring') THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_phase:%',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:setup_identity_mismatch';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_position_mismatch';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:configuration_expired';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_identity_mismatch';
  END IF;
  IF v_dealer.status IN ('left','eliminated') THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_not_eligible';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_authorization_required';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN ('3-5-7','holm-game') THEN
    IF coalesce(p_config->>'leg_value','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'legs_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'pussy_tax_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'pot_max_enabled','false') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_config';
    END IF;
    v_leg := (p_config->>'leg_value')::integer;
    v_legs := (p_config->>'legs_to_win')::integer;
    v_pussy_enabled := coalesce((p_config->>'pussy_tax_enabled')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>'pot_max_enabled')::boolean,false);
    IF coalesce(p_config->>'pussy_tax_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'pot_max_value','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_amount';
    END IF;
    v_pussy_value := (p_config->>'pussy_tax_value')::integer;
    v_pot_max_value := (p_config->>'pot_max_value')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION 'configure_dealer_game:enabled_amount_must_be_positive';
    END IF;
    IF p_game_type='3-5-7' THEN
      IF coalesce(p_config->>'rollover_amount','') !~ '^[1-9][0-9]*$'
         OR coalesce(p_config->>'reveal_at_showdown','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_357_config';
      END IF;
      v_rollover := (p_config->>'rollover_amount')::integer;
      v_reveal := coalesce((p_config->>'reveal_at_showdown')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',v_rollover,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',NULL,'rabbit_hunt',NULL,
        'reveal_at_showdown',v_reveal
      );
    ELSE
      IF coalesce(p_config->>'chucky_cards','') !~ '^[0-9]+$'
         OR coalesce(p_config->>'rabbit_hunt','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_holm_config';
      END IF;
      v_chucky := (p_config->>'chucky_cards')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_chucky_count';
      END IF;
      v_rabbit := coalesce((p_config->>'rabbit_hunt')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',NULL,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',v_chucky,
        'rabbit_hunt',v_rabbit,'reveal_at_showdown',NULL
      );
    END IF;
  ELSIF p_game_type='cribbage' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'double_skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'skunk_threshold','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'double_skunk_threshold','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_skunk_enabled := (p_config->>'skunk_enabled')::boolean;
    v_double_skunk_enabled := (p_config->>'double_skunk_enabled')::boolean;
    v_skunk_threshold := (p_config->>'skunk_threshold')::integer;
    v_double_skunk_threshold := (p_config->>'double_skunk_threshold')::integer;
    v_game_mode := coalesce(p_config->>'game_mode','full');
    IF v_game_mode NOT IN ('full','half','super_quick','sprint','custom')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_thresholds';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'skunk_enabled',v_skunk_enabled,
      'skunk_threshold',v_skunk_threshold,'double_skunk_enabled',v_double_skunk_enabled,
      'double_skunk_threshold',v_double_skunk_threshold,'game_mode',v_game_mode
    );
    IF v_game_mode='custom' THEN
      v_config:=v_config||jsonb_build_object('custom_points_to_win',v_points);
    END IF;
  ELSIF p_game_type='gin-rummy' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'per_point_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'gin_bonus','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'undercut_bonus','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_gin_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_per_point := (p_config->>'per_point_value')::integer;
    v_gin_bonus := (p_config->>'gin_bonus')::integer;
    v_undercut_bonus := (p_config->>'undercut_bonus')::integer;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'per_point_value',v_per_point,
      'gin_bonus',v_gin_bonus,'undercut_bonus',v_undercut_bonus
    );
  ELSIF p_game_type='farkle' THEN
    v_config := private.farkle_resolve_config_v1(v_game,p_config);
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

  IF p_game_type='farkle' OR v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(p_game_id,v_game.current_game_uuid,NULL,'configure'); END IF;
  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status='folded' THEN 'active' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>'left';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         replay_contract_version=CASE WHEN p_game_type='gin-rummy' THEN game.replay_contract_version ELSE NULL END,
         ante_amount=v_ante,
         config_complete=true,
         status='ante_decision',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type='3-5-7' THEN v_rollover WHEN p_game_type='holm-game' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type='holm-game' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type='holm-game' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type='3-5-7' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN ('cribbage','gin-rummy') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type IN ('cribbage','farkle') THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type='cribbage' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN ('holm-game','cribbage') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type='holm-game' THEN 1 WHEN p_game_type='3-5-7' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),'[]'::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    'outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',p_game_id,'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(v_game),'dealer_game',to_jsonb(v_dealer_game),'players',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  v_replay_return := v_result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.consume_automatic_play_stop()'::regprocedure)) NOT IN ('9a9044ce522cd73b9980f0b7e87f774b','08008547a8c6728231ef68054ced5400') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:consume_automatic_play_stop'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.consume_automatic_play_stop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; prior text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE auto_play_stop_round_id=NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_fold=CASE WHEN g.current_game_uuid=NEW.dealer_game_id AND g.current_round=NEW.round_number
 AND g.total_hands=NEW.hand_number THEN false ELSE auto_fold END,
 auto_play_stop_round_id=NULL
 WHERE game_id=NEW.game_id AND auto_play_stop_round_id=NEW.id
 AND (NEW.status='completed' OR CASE WHEN g.game_type='farkle' THEN
 (NEW.farkle_state->>'gamePhase' IS DISTINCT FROM 'playing' OR NEW.farkle_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text)
 ELSE (NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing' OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text) END);
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN NEW;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure)) NOT IN ('011e5fbde8d7e98badd420ea448c841e','a5244a4d537f034e8a125edf8e27a6eb') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:advance_ante_phase_exact'; END IF; END $guard$;
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
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.read_session_frame(uuid)'::regprocedure)) NOT IN ('78597533f2f3e4870b47d1c5b1e5fbd9','6a65b8a32ff86b01f9cc420a83e069a8') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:read_session_frame'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.read_session_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_frame:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'game',to_jsonb(g)||jsonb_build_object('_authorityRevision',private.session_authority_revision(g.id),
    'rounds',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       'horses_state',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'farkle_state',CASE WHEN r.farkle_state IS NULL THEN NULL ELSE r.farkle_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'yahtzee_state',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),'[]'::jsonb)),
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('username',pr.username,'aggression_level',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>'left'),'[]'::jsonb),
  'allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
  'server_now',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_due_canonical_game_timers(integer)'::regprocedure)) NOT IN ('edd034879df909e97dca92c715a4ab3a','e7c784e3fa2e412d3333ffd2355096f4') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:advance_due_canonical_game_timers'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure)) NOT IN ('aae98932bd835c45f9d3761c912266bd','340cd2c6b16f12770242f39ebf53b6ff') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:set_automatic_play'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_automatic_play',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,r.dealer_game_id,r.id,'control'); END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND ((g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing')
 OR (g.game_type='farkle' AND r.farkle_state->>'currentTurnPlayerId'=p.id::text AND r.farkle_state->>'gamePhase'='playing'));
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure)) NOT IN ('7a8472b77a2805bf1d6e562b3166cfb7','ae070b19f465ca8c16c8700e48f7af34') THEN RAISE EXCEPTION 'farkle:shared_definition_drift:set_game_paused'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_game_paused',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'pause'); END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   farkle_state=private.shift_pause_timestamp(farkle_state,ARRAY['turnDeadline'],duration),
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END $function$
;

-- Caller wraps candidate + this proof + recovery twice in BEGIN/ROLLBACK.
-- Every numeric rule in this file is TEST ONLY, not a production recommendation.
CREATE TEMP TABLE farkle_proof_log(case_name text PRIMARY KEY);
CREATE FUNCTION pg_temp.farkle_identity(id uuid) RETURNS void LANGUAGE plpgsql AS $p$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',id::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true);
END $p$;
CREATE FUNCTION pg_temp.farkle_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $p$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_proof:%',label; END IF;
 INSERT INTO farkle_proof_log VALUES(label); END $p$;
CREATE TEMP TABLE farkle_test_config(config jsonb);
INSERT INTO farkle_test_config VALUES ('{"version":1,"testOnly":true,"testLabel":"TEST ONLY: authority proof; NOT APPROVED PRODUCTION RULES","ante_amount":7,"targetScore":1000,"endgame":"immediate","turnSeconds":30,"botDelayMs":1000,"botPolicy":"balanced","botBankThreshold":100,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[2000,2000,2000,2000,2000,2000],"5":[3000,3000,3000,3000,3000,3000],"6":[4000,4000,4000,4000,4000,4000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}');

DO $proof$ DECLARE c jsonb; rules jsonb; s jsonb; original jsonb; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); ids jsonb; denied boolean; mode text;
BEGIN
 SELECT config INTO c FROM farkle_test_config; rules:=c->'rules'; ids:=jsonb_build_array(a,b,d);
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1],rules)=1000,'selected triple only');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1],rules)=2000,'best four interpretation');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1],jsonb_set(rules,'{ofAKind,4,0}','1000'))=1100,'triple plus single beats four kind');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1,1,1],rules)=4000,'best six interpretation');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,2,3,4,5,6],rules)=1500,'straight');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,3,3,4,4],rules)=1500,'three pairs');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,2,3,3,3],rules)=2500,'two triplets');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,2,2,3,3],rules)=1500,'four plus pair');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,5],rules)=150,'independent scoring partition');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,2],rules)=0,'every selected die must score');
 s:=private.farkle_new_state_v1(ids,c,gen_random_uuid());
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,2,3,4,6,2]);
 s:=private.farkle_reduce_v1(s,'hold','[0]');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,1,2,3,4]);
 denied:=false; BEGIN PERFORM private.farkle_reduce_v1(s,'hold','[0,1,2]');
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:non_scoring_selection'; END;
 PERFORM pg_temp.farkle_assert(denied,'previous roll indexes cannot join a later hold');
 s:=private.farkle_reduce_v1(s,'hold','[1,2]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='300','ones across rolls cannot become a triple');
 s:=private.farkle_new_state_v1(ids,c,gen_random_uuid());
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='0' AND s->>'stage'='hold','roll does not commit scoring');
 s:=private.farkle_reduce_v1(s,'hold','[0,1]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='150' AND s->'available'='[2,3,4,5]'::jsonb,'partial hold');
 denied:=false;BEGIN PERFORM private.farkle_reduce_v1(s,'hold','[2]'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:illegal_hold'; END;
 PERFORM pg_temp.farkle_assert(denied,'one hold per roll');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,2,2,2]);
 s:=private.farkle_reduce_v1(s,'hold','[2,3,4,5]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='2150' AND s->>'scoringCycle'='2' AND s->'available'='[0,1,2,3,4,5]'::jsonb,'hot dice across rolls');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='0' AND s->>'currentTurnPlayerId'=b::text AND s->'playerStates'->a::text->>'completedTurns'='1'
 AND s->'playerStates'->a::text->>'banked'='0','farkle loses whole accumulated turn only');
 FOREACH mode IN ARRAY ARRAY['immediate','equal_turns','one_last_turn'] LOOP
  s:=private.farkle_new_state_v1(ids,c||jsonb_build_object('endgame',mode),gen_random_uuid());
  s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
  s:=private.farkle_reduce_v1(s,'bank','[]');
  IF mode='immediate' THEN PERFORM pg_temp.farkle_assert(s->>'gamePhase'='complete' AND s->>'winnerPlayerId'=a::text,'immediate terminal');
  ELSE
   PERFORM pg_temp.farkle_assert(s->'finalQueue'=jsonb_build_array(b,d),'final queue '||mode);
   s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
   s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
   PERFORM pg_temp.farkle_assert(s->>'gamePhase'='complete' AND s->>'winnerPlayerId'=a::text
    AND NOT EXISTS(SELECT 1 FROM jsonb_each(s->'playerStates') WHERE value->>'completedTurns'<>'1'),'exact final counts '||mode);
  END IF;
 END LOOP;
 -- Trigger in the middle of a cycle. Last-turn queue wraps past the dealer,
 -- excludes the trigger and is not restarted by later target-reaching BANKs.
 s:=private.farkle_new_state_v1(ids,c||jsonb_build_object('endgame','one_last_turn'),gen_random_uuid());
 s:=jsonb_set(s,ARRAY['playerStates',a::text,'completedTurns'],'1');
 s:=s||jsonb_build_object('currentTurnPlayerId',b,'stage','bank_or_roll','thisTurn',1000);
 s:=private.farkle_reduce_v1(s,'bank','[]');
 PERFORM pg_temp.farkle_assert(s->'finalQueue'=jsonb_build_array(d,a),'one last turn clockwise wrap');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 s:=private.farkle_reduce_v1(s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000),'bank','[]');
 PERFORM pg_temp.farkle_assert(s->>'tiebreakTurn'='1' AND s->'eligible'=jsonb_build_array(a,b)
  AND s->'playerStates'->a::text->>'completedTurns'='2' AND s->'playerStates'->b::text->>'completedTurns'='1','equal tiebreak exact lifetime counts');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'tiebreakTurn'='2' AND s->'finalQueue'=jsonb_build_array(a,b),'repeat equal tiebreak cycle');
 s:=private.farkle_reduce_v1(s||jsonb_build_object('stage','bank_or_roll','thisTurn',100),'bank','[]');
 PERFORM pg_temp.farkle_assert(s->>'gamePhase'='playing' AND s->>'currentTurnPlayerId'=b::text,'tiebreak leader cannot finish early');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'winnerPlayerId'=a::text AND s->'playerStates'->d::text->>'completedTurns'='1','tiebreak winner excludes prior nonleaders');
END $proof$;

DO $proof$ DECLARE admin_id uuid; other_id uuid; fixture_game_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; s jsonb; before_state jsonb; answer jsonb; replay jsonb; req uuid; bank_req uuid;
 denied boolean; intent bigint; version bigint; first_actor uuid; actor_user uuid; cash jsonb; after_cash jsonb; cfg_deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO other_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 IF admin_id IS NULL OR other_id IS NULL THEN RAISE EXCEPTION 'farkle_proof:requires_admin_and_peer'; END IF;
 PERFORM pg_temp.farkle_identity(admin_id);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true); PERFORM set_config('request.jwt.claim.role','authenticated',true);
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 INSERT INTO public.games(id,name,status,game_type,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(fixture_game_id,'TEST ONLY: Farkle rollback proof','game_selection',NULL,admin_id,1,false,cfg_deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot) VALUES
 (a,fixture_game_id,admin_id,1,100,'active',false,false),(b,fixture_game_id,other_id,3,100,'active',false,false);
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:creation_disabled'; END;
 PERFORM pg_temp.farkle_assert(denied,'creation disabled before client release');
 UPDATE private.farkle_release SET creation_enabled=true WHERE singleton;
 PERFORM pg_temp.farkle_identity(other_id);
 UPDATE public.games SET dealer_position=3 WHERE id=fixture_game_id;
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,b,3,'farkle',input,cfg_deadline); EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'farkle:admin_only' THEN RAISE; END IF; denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'nonadmin direct setup rejected');
 UPDATE public.games SET dealer_position=1 WHERE id=fixture_game_id;
 PERFORM pg_temp.farkle_identity(admin_id);
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,a,1,'farkle',input-'testConfiguration',cfg_deadline); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:production_defaults_unapproved'; END;
 PERFORM pg_temp.farkle_assert(denied,'unapproved defaults never resolve');
 answer:=public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline); dg:=(answer->'dealer_game'->>'id')::uuid;
 answer:=public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline);
 PERFORM pg_temp.farkle_assert(answer->>'deduped'='true','idempotent configuration');
 denied:=false;BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{rules,singles,1}','999') WHERE id=dg; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.farkle_assert(denied,'frozen rules cannot change');
 denied:=false;BEGIN UPDATE public.dealer_games SET game_type='horses' WHERE id=dg; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.farkle_assert(denied,'game type cannot bypass immutable rules');
 SELECT * INTO g FROM public.games WHERE id=fixture_game_id;
 PERFORM private.farkle_claim_v1(g.id,dg,NULL,'configure'); -- trusted synthetic fixture writes only
 PERFORM pg_temp.farkle_assert(private.farkle_resolve_config_v1(g,jsonb_build_object('ante_amount',7,'runBackDealerGameId',dg))=(SELECT config FROM public.dealer_games WHERE id=dg),'run back uses exact frozen snapshot');
 UPDATE public.players SET ante_decision='ante_up' WHERE game_id=g.id;
 answer:=private.advance_ante_phase_exact(g.id,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM set_config('app.farkle_authority','',true);
 denied:=false; BEGIN PERFORM public.increment_player_chips(b,1); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
 PERFORM pg_temp.farkle_assert(denied,'generic increment definer cannot move Farkle chips');
 denied:=false; BEGIN PERFORM public.decrement_player_chips(ARRAY[b],1); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
 PERFORM pg_temp.farkle_assert(denied,'generic decrement definer cannot move Farkle chips');
 denied:=false; BEGIN UPDATE public.rounds SET farkle_state=NULL WHERE id=rd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'owner role without claim cannot clear Farkle state');
 denied:=false; BEGIN UPDATE public.games SET game_type='horses' WHERE id=g.id; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'owner role without claim cannot switch Farkle game');
 PERFORM pg_temp.farkle_assert(s->'turnOrder'=jsonb_build_array(b,a) AND s->>'currentTurnPlayerId'=b::text,'left of dealer across empty seat');
 PERFORM pg_temp.farkle_assert((SELECT sum(chips) FROM public.players WHERE game_id=g.id)=200 AND (SELECT pot FROM public.games WHERE id=g.id)=0,'no chip ante for fixed stake');
 PERFORM pg_temp.farkle_identity(other_id);
 req:=gen_random_uuid(); answer:=public.farkle_apply_action(rd,b,'roll',0,req);
 replay:=public.farkle_apply_action(rd,b,'roll',0,req);
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','action authority claim cannot leak to next RPC');
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND replay->>'deduped'='true' AND answer->'state'=replay->'state','duplicate roll never rerolls');
 denied:=false;BEGIN PERFORM public.farkle_apply_action(rd,b,'bank',0,req); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:replay_payload_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'request id payload binding');
 PERFORM pg_temp.farkle_assert(public.farkle_apply_action(rd,b,'roll',0,gen_random_uuid())->>'outcome'='stale_action','stale sequence rejected');
 PERFORM pg_temp.farkle_identity(gen_random_uuid());
 denied:=false;BEGIN PERFORM public.farkle_apply_action(rd,b,'roll',1,gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'outsider cannot act');
 -- Fresh deterministic authority fixture state, not client-supplied randomness.
 PERFORM private.farkle_claim_v1(g.id,dg,NULL,'configure');
 s:=private.farkle_new_state_v1(jsonb_build_array(b,a),c,rd);
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
 s:=s||jsonb_build_object('actionSequence',10,'turnDeadline',clock_timestamp()-interval '1 second');
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 UPDATE public.games SET real_money=true WHERE id=g.id;
 before_state:=s; answer:=private.farkle_advance_due_v1(rd);
 SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
 PERFORM pg_temp.farkle_assert((SELECT is_paused FROM public.games WHERE id=g.id) AND (s-'turnDeadline')=(before_state-'turnDeadline')
 AND NOT (SELECT auto_fold FROM public.players WHERE id=b),'real timeout pauses without scoring decisions');
 SELECT pause_version INTO version FROM public.games WHERE id=g.id;
 PERFORM pg_temp.farkle_identity(admin_id);
 answer:=public.set_game_paused(g.id,false,dg,version);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='resumed' AND (SELECT (farkle_state->>'turnDeadline')::timestamptz>clock_timestamp() FROM public.rounds WHERE id=rd),'resume gives human decision window');
 UPDATE public.games SET real_money=false WHERE id=g.id;
 UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE id=rd;
 answer:=private.farkle_advance_due_v1(rd);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND (SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=b)
 AND answer->'state'->>'stage'='bank_or_roll','fake timeout uses authoritative hold path');
 PERFORM pg_temp.farkle_identity(other_id);
 SELECT intent_version INTO intent FROM public.players WHERE id=b;
 answer:=public.set_automatic_play(g.id,rd,dg,b,intent,false);
 PERFORM pg_temp.farkle_assert(answer->>'deferred'='true' AND (SELECT auto_fold AND auto_play_stop_round_id=rd AND NOT sit_out_next_hand FROM public.players WHERE id=b),'active turn reclaim is persisted and deferred');
 PERFORM public.read_session_frame(g.id);
 PERFORM pg_temp.farkle_assert((SELECT auto_fold AND auto_play_stop_round_id=rd FROM public.players WHERE id=b),'reconnect does not reclaim');
 -- Shared resume writes Horses columns too: it must not consume Farkle's request.
 UPDATE public.rounds SET horses_state=horses_state WHERE id=rd;
 PERFORM pg_temp.farkle_assert((SELECT auto_fold AND auto_play_stop_round_id=rd FROM public.players WHERE id=b),'shared consume respects active Farkle turn');
 UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE id=rd;
 answer:=private.farkle_advance_due_v1(rd);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND answer->'state'->>'currentTurnPlayerId'=a::text
 AND (SELECT NOT auto_fold AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=b),'bank completes deferred reclaim');
 SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
 s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 PERFORM pg_temp.farkle_identity(admin_id);
 bank_req:=gen_random_uuid();answer:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 SELECT jsonb_object_agg(id,chips) INTO cash FROM public.players WHERE game_id=g.id;
 PERFORM pg_temp.farkle_assert(cash->>a::text='107' AND cash->>b::text='93' AND (SELECT count(*) FROM public.game_results WHERE dealer_game_id=dg AND settlement_key='farkle_terminal')=1,'fixed stake winner paid once');
 replay:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 PERFORM pg_temp.farkle_assert(replay->>'deduped'='true' AND replay->'settlement'=answer->'settlement','terminal action replay receipt');
 PERFORM private.farkle_settle_v1(rd);
 PERFORM pg_temp.farkle_assert((SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g.id)=cash,'settlement replay cannot move chips');
 PERFORM pg_temp.farkle_assert((SELECT count(*) FROM public.session_player_snapshots WHERE dealer_game_id=dg)=2
 AND (SELECT status FROM public.rounds WHERE id=rd)='completed' AND (SELECT status FROM public.games WHERE id=g.id)='game_over','terminal snapshots and lifecycle');
 replay:=public.farkle_read_replay(rd);
 PERFORM pg_temp.farkle_assert(replay->'config'=(SELECT config FROM public.dealer_games WHERE id=dg)
 AND jsonb_array_length(replay->'events')>=4,'semantic replay retains frozen rules and events');
 UPDATE public.games SET game_type='yahtzee',status='game_selection',current_game_uuid=NULL WHERE id=g.id;
 replay:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 PERFORM pg_temp.farkle_assert(replay->>'deduped'='true' AND (SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g.id)=cash,'late replay after game transition');
 PERFORM pg_temp.farkle_assert(NOT has_function_privilege('authenticated','private.farkle_reduce_v1(jsonb,text,jsonb,integer[])','EXECUTE'),'private authority not publicly executable');
 UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
END $proof$;

-- Synthetic fixtures only; this entire file runs inside the outer rollback.
CREATE FUNCTION pg_temp.farkle_generic_definer(target_game uuid,target_round uuid,target_player uuid,target_dealer uuid,kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $p$
BEGIN
 CASE kind
 WHEN 'game' THEN UPDATE public.games SET pot=pot+1 WHERE id=target_game;
 WHEN 'round' THEN UPDATE public.rounds SET farkle_state=NULL WHERE id=target_round;
 WHEN 'round_insert' THEN INSERT INTO public.rounds(game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(target_game,2,2,0,'betting',0);
 WHEN 'player' THEN UPDATE public.players SET chips=chips+1 WHERE id=target_player;
 WHEN 'delete_player' THEN DELETE FROM public.players WHERE id=target_player;
 WHEN 'delete_game' THEN DELETE FROM public.games WHERE id=target_game;
 WHEN 'result' THEN INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,winner_player_id,pot_won) VALUES(target_game,target_dealer,1,'farkle',target_player,99);
 WHEN 'snapshot' THEN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
 SELECT target_game,target_dealer,1,id,user_id,'TEST ONLY',999,is_bot FROM public.players WHERE id=target_player;
 END CASE;
END $p$;
DO $proof$
DECLARE admin_id uuid; peer_id uuid; bot_user uuid; gid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); bot uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; s jsonb; ans jsonb; denied boolean; intent bigint; deadline timestamptz; kind text;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 SELECT id INTO bot_user FROM public.profiles WHERE id NOT IN (admin_id,peer_id) ORDER BY id LIMIT 1;
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(admin_id);
 UPDATE private.farkle_release SET creation_enabled=true,admin_only=false WHERE singleton;
 deadline:=clock_timestamp()+interval '15 minutes';
 INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(gid,'TEST ONLY: Farkle hardening','game_selection',admin_id,4,false,deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot) VALUES
 (a,gid,admin_id,4,100,'active',false),(b,gid,peer_id,3,100,'active',false),(bot,gid,bot_user,5,100,'active',true);
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM pg_temp.farkle_identity(peer_id);
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,input); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:test_config_admin_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'test configuration stays admin only with public release gate');
 UPDATE public.games SET dealer_position=3 WHERE id=gid;
 denied:=false; BEGIN PERFORM public.configure_dealer_game(gid,b,3,'farkle',input,deadline); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:test_config_admin_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'public dealer RPC rejects nonadmin test scoring after release gate opens');
 UPDATE public.games SET dealer_position=4 WHERE id=gid;
 PERFORM pg_temp.farkle_identity(admin_id);
 g.real_money:=true;
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,input); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:test_rules_fake_money_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'real money rejects test scoring');
 g.real_money:=false;
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,jsonb_set(input,'{testConfiguration,botPolicy}','"aggressive"')); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:unsupported_bot_policy'; END;
 PERFORM pg_temp.farkle_assert(denied,'unimplemented aggressive policy rejected');
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,jsonb_set(input,'{testConfiguration,botPolicy}','"conservative"')); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:unsupported_bot_policy'; END;
 PERFORM pg_temp.farkle_assert(denied,'unimplemented conservative policy rejected');
 ans:=public.configure_dealer_game(gid,a,4,'farkle',input,deadline); dg:=(ans->'dealer_game'->>'id')::uuid;
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','configuration claim restored after return');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET ante_decision='ante_up',sitting_out=false WHERE game_id=gid;
 UPDATE public.players SET auto_fold=true WHERE id=b;
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM private.advance_ante_phase_exact(gid,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM pg_temp.farkle_assert(s->'turnOrder'=jsonb_build_array(b,bot,a),'middle dealer lower occupied seats clockwise with gaps 3 5 4');
 PERFORM pg_temp.farkle_assert((s->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()-interval '1 second' AND clock_timestamp()+interval '2 seconds','initial bot policy deadline uses bot delay');
 denied:=false;
 BEGIN EXECUTE '-- Atomic recovery: exclusive ownership waits for all in-flight creators.
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
DO $gate$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE game_type=''farkle'' AND status IN (''ante_decision'',''in_progress'')) THEN RAISE EXCEPTION ''farkle:active_games_require_compatible_recovery''; END IF;
END $gate$;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)''::regprocedure)) NOT IN (''9fc99d2870622c8bb0aebe5a78e7f00f'',''3cd85a247c2cbcecf6f64ef05dc74052'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:configure_dealer_game''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public'', ''private''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>''role'','''') = ''service_role'';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION ''configure_dealer_game:missing_exact_identity'';
  END IF;
  IF p_game_type NOT IN (
    ''3-5-7'',''holm-game'',''cribbage'',''gin-rummy'',
    ''horses'',''ship-captain-crew'',''yahtzee''
  ) THEN
    RAISE EXCEPTION ''configure_dealer_game:unsupported_game_type:%'',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> ''object'' THEN
    RAISE EXCEPTION ''configure_dealer_game:invalid_config_document'';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION ''configure_dealer_game:authentication_required'';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,''public.configure_dealer_game'',false,jsonb_build_object(''p_game_id'',p_game_id,''p_dealer_player_id'',p_dealer_player_id,''p_expected_dealer_position'',p_expected_dealer_position,''p_game_type'',p_game_type,''p_config'',p_config,''p_expected_config_deadline'',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN RAISE EXCEPTION ''configure_dealer_game:game_not_found''; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,''admin''::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION ''configure_dealer_game:not_in_session'';
  END IF;

  IF coalesce(p_config->>''ante_amount'','''') !~ ''^[1-9][0-9]*$'' THEN
    RAISE EXCEPTION ''configure_dealer_game:invalid_ante'';
  END IF;
  v_ante := (p_config->>''ante_amount'')::integer;
  v_request_hash := md5(concat_ws(''|'',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION ''configure_dealer_game:replay_payload_mismatch'';
    END IF;
    v_replay_return := v_claim.result || jsonb_build_object(''outcome'',''already_configured'',''deduped'',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_dealer_player_id'',p_dealer_player_id,''p_expected_dealer_position'',p_expected_dealer_position,''p_game_type'',p_game_type,''p_config'',p_config,''p_expected_config_deadline'',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION ''configure_dealer_game:game_paused'';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION ''configure_dealer_game:session_ending'';
  END IF;
  IF v_game.status NOT IN (''game_selection'',''configuring'') THEN
    RAISE EXCEPTION ''configure_dealer_game:invalid_phase:%'',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION ''configure_dealer_game:setup_identity_mismatch'';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION ''configure_dealer_game:dealer_position_mismatch'';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION ''configure_dealer_game:configuration_expired'';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION ''configure_dealer_game:dealer_identity_mismatch'';
  END IF;
  IF v_dealer.status IN (''left'',''eliminated'') THEN
    RAISE EXCEPTION ''configure_dealer_game:dealer_not_eligible'';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION ''configure_dealer_game:dealer_authorization_required'';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN (''3-5-7'',''holm-game'') THEN
    IF coalesce(p_config->>''leg_value'','''') !~ ''^[1-9][0-9]*$''
       OR coalesce(p_config->>''legs_to_win'','''') !~ ''^[1-9][0-9]*$''
       OR coalesce(p_config->>''pussy_tax_enabled'',''false'') NOT IN (''true'',''false'')
       OR coalesce(p_config->>''pot_max_enabled'',''false'') NOT IN (''true'',''false'') THEN
      RAISE EXCEPTION ''configure_dealer_game:invalid_card_game_config'';
    END IF;
    v_leg := (p_config->>''leg_value'')::integer;
    v_legs := (p_config->>''legs_to_win'')::integer;
    v_pussy_enabled := coalesce((p_config->>''pussy_tax_enabled'')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>''pot_max_enabled'')::boolean,false);
    IF coalesce(p_config->>''pussy_tax_value'','''') !~ ''^[0-9]+$''
       OR coalesce(p_config->>''pot_max_value'','''') !~ ''^[0-9]+$'' THEN
      RAISE EXCEPTION ''configure_dealer_game:invalid_card_game_amount'';
    END IF;
    v_pussy_value := (p_config->>''pussy_tax_value'')::integer;
    v_pot_max_value := (p_config->>''pot_max_value'')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION ''configure_dealer_game:enabled_amount_must_be_positive'';
    END IF;
    IF p_game_type=''3-5-7'' THEN
      IF coalesce(p_config->>''rollover_amount'','''') !~ ''^[1-9][0-9]*$''
         OR coalesce(p_config->>''reveal_at_showdown'',''false'') NOT IN (''true'',''false'') THEN
        RAISE EXCEPTION ''configure_dealer_game:invalid_357_config'';
      END IF;
      v_rollover := (p_config->>''rollover_amount'')::integer;
      v_reveal := coalesce((p_config->>''reveal_at_showdown'')::boolean,false);
      v_config := jsonb_build_object(
        ''ante_amount'',v_ante,''rollover_amount'',v_rollover,''leg_value'',v_leg,
        ''pussy_tax_enabled'',v_pussy_enabled,''pussy_tax_value'',v_pussy_value,
        ''legs_to_win'',v_legs,''pot_max_enabled'',v_pot_max_enabled,
        ''pot_max_value'',v_pot_max_value,''chucky_cards'',NULL,''rabbit_hunt'',NULL,
        ''reveal_at_showdown'',v_reveal
      );
    ELSE
      IF coalesce(p_config->>''chucky_cards'','''') !~ ''^[0-9]+$''
         OR coalesce(p_config->>''rabbit_hunt'',''false'') NOT IN (''true'',''false'') THEN
        RAISE EXCEPTION ''configure_dealer_game:invalid_holm_config'';
      END IF;
      v_chucky := (p_config->>''chucky_cards'')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION ''configure_dealer_game:invalid_chucky_count'';
      END IF;
      v_rabbit := coalesce((p_config->>''rabbit_hunt'')::boolean,false);
      v_config := jsonb_build_object(
        ''ante_amount'',v_ante,''rollover_amount'',NULL,''leg_value'',v_leg,
        ''pussy_tax_enabled'',v_pussy_enabled,''pussy_tax_value'',v_pussy_value,
        ''legs_to_win'',v_legs,''pot_max_enabled'',v_pot_max_enabled,
        ''pot_max_value'',v_pot_max_value,''chucky_cards'',v_chucky,
        ''rabbit_hunt'',v_rabbit,''reveal_at_showdown'',NULL
      );
    END IF;
  ELSIF p_game_type=''cribbage'' THEN
    IF coalesce(p_config->>''points_to_win'','''') !~ ''^[1-9][0-9]*$''
       OR coalesce(p_config->>''skunk_enabled'',''false'') NOT IN (''true'',''false'')
       OR coalesce(p_config->>''double_skunk_enabled'',''false'') NOT IN (''true'',''false'')
       OR coalesce(p_config->>''skunk_threshold'','''') !~ ''^[0-9]+$''
       OR coalesce(p_config->>''double_skunk_threshold'','''') !~ ''^[0-9]+$'' THEN
      RAISE EXCEPTION ''configure_dealer_game:invalid_cribbage_config'';
    END IF;
    v_points := (p_config->>''points_to_win'')::integer;
    v_skunk_enabled := (p_config->>''skunk_enabled'')::boolean;
    v_double_skunk_enabled := (p_config->>''double_skunk_enabled'')::boolean;
    v_skunk_threshold := (p_config->>''skunk_threshold'')::integer;
    v_double_skunk_threshold := (p_config->>''double_skunk_threshold'')::integer;
    v_game_mode := coalesce(p_config->>''game_mode'',''full'');
    IF v_game_mode NOT IN (''full'',''half'',''super_quick'',''sprint'',''custom'')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION ''configure_dealer_game:invalid_cribbage_thresholds'';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      ''ante_amount'',v_ante,''points_to_win'',v_points,''skunk_enabled'',v_skunk_enabled,
      ''skunk_threshold'',v_skunk_threshold,''double_skunk_enabled'',v_double_skunk_enabled,
      ''double_skunk_threshold'',v_double_skunk_threshold,''game_mode'',v_game_mode
    );
    IF v_game_mode=''custom'' THEN
      v_config:=v_config||jsonb_build_object(''custom_points_to_win'',v_points);
    END IF;
  ELSIF p_game_type=''gin-rummy'' THEN
    IF coalesce(p_config->>''points_to_win'','''') !~ ''^[1-9][0-9]*$''
       OR coalesce(p_config->>''per_point_value'','''') !~ ''^[0-9]+$''
       OR coalesce(p_config->>''gin_bonus'','''') !~ ''^[0-9]+$''
       OR coalesce(p_config->>''undercut_bonus'','''') !~ ''^[0-9]+$'' THEN
      RAISE EXCEPTION ''configure_dealer_game:invalid_gin_config'';
    END IF;
    v_points := (p_config->>''points_to_win'')::integer;
    v_per_point := (p_config->>''per_point_value'')::integer;
    v_gin_bonus := (p_config->>''gin_bonus'')::integer;
    v_undercut_bonus := (p_config->>''undercut_bonus'')::integer;
    v_config := jsonb_build_object(
      ''ante_amount'',v_ante,''points_to_win'',v_points,''per_point_value'',v_per_point,
      ''gin_bonus'',v_gin_bonus,''undercut_bonus'',v_undercut_bonus
    );
  ELSE
    v_config := jsonb_build_object(''ante_amount'',v_ante);
  END IF;

  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config(''app.cribbage_authoritative_write'',''on'',true);
  PERFORM set_config(''app.gin_rummy_authoritative_write'',''on'',true);
  PERFORM set_config(''app.three_five_seven_authoritative_write'',''on'',true);
  PERFORM set_config(''app.yahtzee_authoritative_write'',''on'',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN ''ante_up'' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status=''folded'' THEN ''active'' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>''left'';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         replay_contract_version=CASE WHEN p_game_type=''gin-rummy'' THEN game.replay_contract_version ELSE NULL END,
         ante_amount=v_ante,
         config_complete=true,
         status=''ante_decision'',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type=''3-5-7'' THEN v_rollover WHEN p_game_type=''holm-game'' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type=''holm-game'' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type=''holm-game'' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type=''3-5-7'' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN (''cribbage'',''gin-rummy'') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type=''cribbage'' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type=''cribbage'' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type=''cribbage'' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type=''cribbage'' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type=''cribbage'' THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type=''cribbage'' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN (''holm-game'',''cribbage'') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type=''holm-game'' THEN 1 WHEN p_game_type=''3-5-7'' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN (''3-5-7'',''holm-game'') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),''[]''::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    ''outcome'',''configured'',''deduped'',false,
    ''setup_identity'',jsonb_build_object(
      ''game_id'',p_game_id,''dealer_position'',p_expected_dealer_position,
      ''expected_config_deadline'',p_expected_config_deadline
    ),
    ''game'',to_jsonb(v_game),''dealer_game'',to_jsonb(v_dealer_game),''players'',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  v_replay_return := v_result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_dealer_player_id'',p_dealer_player_id,''p_expected_dealer_position'',p_expected_dealer_position,''p_game_type'',p_game_type,''p_config'',p_config,''p_expected_config_deadline'',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO postgres;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''private.consume_automatic_play_stop()''::regprocedure)) NOT IN (''9a9044ce522cd73b9980f0b7e87f774b'',''08008547a8c6728231ef68054ced5400'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:consume_automatic_play_stop''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.consume_automatic_play_stop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE g public.games%ROWTYPE; prior text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE auto_play_stop_round_id=NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 prior:=coalesce(current_setting(''app.three_five_seven_authoritative_write'',true),'''');
 PERFORM set_config(''app.three_five_seven_authoritative_write'',''on'',true);
 UPDATE public.players SET
 auto_fold=CASE WHEN g.current_game_uuid=NEW.dealer_game_id AND g.current_round=NEW.round_number
 AND g.total_hands=NEW.hand_number THEN false ELSE auto_fold END,
 auto_play_stop_round_id=NULL
 WHERE game_id=NEW.game_id AND auto_play_stop_round_id=NEW.id
 AND (NEW.status=''completed'' OR NEW.horses_state->>''gamePhase'' IS DISTINCT FROM ''playing''
 OR NEW.horses_state->>''currentTurnPlayerId'' IS DISTINCT FROM id::text);
 PERFORM set_config(''app.three_five_seven_authoritative_write'',prior,true);
 RETURN NEW;
END $function$
;
ALTER FUNCTION private.consume_automatic_play_stop() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.consume_automatic_play_stop() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.consume_automatic_play_stop() TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)''::regprocedure)) NOT IN (''011e5fbde8d7e98badd420ea448c841e'',''a5244a4d537f034e8a125edf8e27a6eb'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:advance_ante_phase_exact''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,''private.advance_ante_phase_exact'',false,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object(''outcome'',''missing_game'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM ''ante_decision''
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object(''outcome'',''stale_identity'',''status'',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object(''outcome'',''paused'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET ante_decision=''ante_up'',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN (''observer'',''left'')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision=''sit_out''
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision=''sit_out'',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN (''observer'',''left'')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN (''observer'',''left'')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      ''outcome'',''pending'',''unresolved'',v_unresolved,
      ''deadline'',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN (''observer'',''left'');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN (''observer'',''left'')
     AND player.position IS NOT NULL
     AND player.ante_decision=''ante_up'';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup''s expired transaction-local authority flags.
  PERFORM set_config(''request.jwt.claim.role'',''service_role'',true);
  PERFORM set_config(''request.jwt.claims'',''{"role":"service_role"}'',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status=''waiting'',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:=''waiting-not-enough-players'';
    END IF;
    v_replay_return := jsonb_build_object(''outcome'',''not_enough_players'',''reason'',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN (''3-5-7'',''3-5-7-game'',''357'') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN (''holm'',''holm-game'') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type=''cribbage'' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type=''gin-rummy'' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type=''yahtzee'' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN (''horses'',''ship-captain-crew'') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION ''advance_ante_phase_exact:unsupported_game_type:%'',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    ''outcome'',''advanced'',''game_type'',v_game.game_type,''start'',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_deadline'',p_expected_deadline,''p_now'',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''public.read_session_frame(uuid)''::regprocedure)) NOT IN (''78597533f2f3e4870b47d1c5b1e5fbd9'',''6a65b8a32ff86b01f9cc420a83e069a8'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:read_session_frame''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.read_session_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION ''session_frame:authentication_required'' USING ERRCODE=''42501''; END IF;
 SELECT jsonb_build_object(
  ''game'',to_jsonb(g)||jsonb_build_object(''_authorityRevision'',private.session_authority_revision(g.id),
    ''rounds'',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       ''horses_state'',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object(''_authorityRevision'',r.authority_revision,''_authorityScope'',r.id) END,
       ''yahtzee_state'',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object(''_authorityRevision'',r.authority_revision,''_authorityScope'',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),''[]''::jsonb)),
  ''players'',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object(''profiles'',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(''username'',pr.username,''aggression_level'',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>''left''),''[]''::jsonb),
  ''allow_bot_dealers'',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type=''holm'' LIMIT 1),
  ''server_now'',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $function$
;
ALTER FUNCTION public.read_session_frame(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_session_frame(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''private.advance_due_canonical_game_timers(integer)''::regprocedure)) NOT IN (''edd034879df909e97dca92c715a4ab3a'',''e7c784e3fa2e412d3333ffd2355096f4'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:advance_due_canonical_game_timers''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config(''request.jwt.claim.role'',''service_role'',true);
  PERFORM set_config(''request.jwt.claims'',''{"role":"service_role"}'',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task=''canonical_timers''
       AND timer.state=''scheduled''
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state=''processing'',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN ''dealer_selection_prepare'' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>''timer_generation'')::bigint
          );
        WHEN ''dealer_selection_complete'' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>''timer_generation'')::bigint
          );
        WHEN ''config_timeout'' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>''expected_deadline'')::timestamptz,
            (v_timer.metadata->>''expected_dealer_position'')::integer
          );
        WHEN ''ante_phase'' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>''expected_deadline'')::timestamptz,
            clock_timestamp()
          );
        WHEN ''holm_decision'' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object(''outcome'',''stale_actor'');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type=''holm'' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN ''fold'' ELSE ''stay'' END;
            ELSE
              v_decision:=''fold'';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN ''horses_scc_turn'' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN ''horses_scc_terminal'' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>''status''=''tie_waiting_for_client'' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN ''standard_postgame'' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION ''advance_due_canonical_game_timers:unknown_kind:%'',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>''outcome'' IN (''pending'',''paused'',''not_prepared'',''no_eligible_players'',''deadline_not_expired'') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state=''scheduled'',
               due_at=CASE WHEN v_result->>''outcome'' IN (''pending'',''deadline_not_expired'')
                 AND v_result->>''deadline'' IS NOT NULL
                 THEN (v_result->>''deadline'')::timestamptz
                 ELSE clock_timestamp()+interval ''1 second'' END,
               metadata=CASE WHEN v_timer.timer_kind=''ante_phase''
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   ''expected_deadline'',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state=''completed'',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 ''result'',coalesce(v_result,''{}''::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || '':'' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state=''scheduled'',due_at=clock_timestamp()+interval ''5 seconds'',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN (''horses'',''ship-captain-crew'')
     AND game_row.status=''in_progress''
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>''gamePhase''=''playing''
     AND nullif(round_row.horses_state->>''turnDeadline'','''') IS NULL
     AND actor.id::text=round_row.horses_state->>''currentTurnPlayerId''
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred(''canonical_timers'',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,''{turnDeadline}'',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure(''canonical_timers'',v_legacy.game_id,''legacy:''||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure(''canonical_timers'',v_legacy.game_id,''legacy:''||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    ''outcome'',CASE WHEN v_failed=0 THEN ''completed'' ELSE ''partial_failure'' END,
    ''processed'',v_processed,''failed'',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)''::regprocedure)) NOT IN (''aae98932bd835c45f9d3761c912266bd'',''340cd2c6b16f12770242f39ebf53b6ff'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:set_automatic_play''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION ''automatic_play:invalid_request'' USING ERRCODE=''22023''; END IF;
 -- Match the dice action owner''s round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object(''outcome'',''stale_identity'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_round_id'',p_round_id,''p_dealer_game_id'',p_dealer_game_id,''p_player_id'',p_player_id,''p_expected_version'',p_expected_version,''p_enabled'',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,''public.set_automatic_play'',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT''s FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION ''automatic_play:not_authorized'' USING ERRCODE=''42501''; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>''in_progress'' OR r.status=''completed'' OR p.status IN (''left'',''observer'') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object(''outcome'',''stale_identity'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_round_id'',p_round_id,''p_dealer_game_id'',p_dealer_game_id,''p_player_id'',p_player_id,''p_expected_version'',p_expected_version,''p_enabled'',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN (''horses'',''ship-captain-crew'')
 AND r.horses_state->>''currentTurnPlayerId''=p.id::text AND r.horses_state->>''gamePhase''=''playing'';
 prior:=coalesce(current_setting(''app.three_five_seven_authoritative_write'',true),'''');
 PERFORM set_config(''app.three_five_seven_authoritative_write'',''on'',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config(''app.three_five_seven_authoritative_write'',prior,true);
 v_replay_return := jsonb_build_object(''outcome'',''accepted'',''deferred'',coalesce(deferred,false),''player'',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_round_id'',p_round_id,''p_dealer_game_id'',p_dealer_game_id,''p_player_id'',p_player_id,''p_expected_version'',p_expected_version,''p_enabled'',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef(''public.set_game_paused(uuid,boolean,uuid,bigint)''::regprocedure)) NOT IN (''7a8472b77a2805bf1d6e562b3166cfb7'',''ae070b19f465ca8c16c8700e48f7af34'') THEN RAISE EXCEPTION ''farkle:recovery_definition_drift:set_game_paused''; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:=''{}''; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION ''set_game_paused:invalid_request'' USING ERRCODE=''22023''; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,''public.set_game_paused'',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT''s FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object(''outcome'',''missing_game'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_paused'',p_paused,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_pause_version'',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>''role'','''')<>''service_role'' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),''admin''::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN (''left'',''observer'')))))
 THEN v_replay_return := jsonb_build_object(''outcome'',''not_authorized'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_paused'',p_paused,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_pause_version'',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN (''session_ended'',''completed'') THEN v_replay_return := jsonb_build_object(''outcome'',''stale_identity'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_paused'',p_paused,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_pause_version'',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object(''outcome'',''already_set'',''is_paused'',p_paused,''pause_version'',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_paused'',p_paused,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_pause_version'',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 FOREACH ctx IN ARRAY ARRAY[''app.session_pause_write'',''app.three_five_seven_authoritative_write'',''app.cribbage_authoritative_write'',''app.gin_rummy_authoritative_write'',''app.yahtzee_authoritative_write''] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''''));
  PERFORM set_config(ctx,''on'',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state=''scheduled'';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object(''outcome'',''paused'',''is_paused'',true,''paused_at'',now_at,''remaining_seconds'',remaining,''pause_version'',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION ''set_game_paused:missing_pause_identity''; END IF;
  duration:=greatest(interval ''0 seconds'',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status=''game_over'' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status=''cribbage_dealer_selection''
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY[''preparedAt''],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY[''turnDeadline''],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY[''turnDeadline''],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>''completed'' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY[''scoringDueAt''],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY[''completeDueAt''],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY[''botActionDueAt''],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY[''countingResolution'',''presentationReleaseAt''],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY[''countingResolution'',''presentationFallbackAt''],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state=''scheduled''
   AND timer_kind IN (''dealer_selection_prepare'',''dealer_selection_complete'');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object(''outcome'',''resumed'',''is_paused'',false,''paused_duration_seconds'',extract(epoch FROM duration),''pause_version'',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY[''app.session_pause_write'',''app.three_five_seven_authoritative_write'',''app.cribbage_authoritative_write'',''app.gin_rummy_authoritative_write'',''app.yahtzee_authoritative_write''] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_paused'',p_paused,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_pause_version'',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object(''outcome'',''busy'');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object(''p_game_id'',p_game_id,''p_paused'',p_paused,''p_expected_dealer_game_id'',p_expected_dealer_game_id,''p_expected_pause_version'',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;
'; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:active_games_require_compatible_recovery'; END;
 PERFORM pg_temp.farkle_assert(denied AND (SELECT creation_enabled FROM private.farkle_release WHERE singleton),'recovery aborts atomically while an active Farkle exists');
 PERFORM set_config('app.farkle_authority','',true);
 FOREACH kind IN ARRAY ARRAY['game','round','round_insert','player','delete_player','delete_game','result','snapshot'] LOOP
  denied:=false; BEGIN PERFORM pg_temp.farkle_generic_definer(gid,rd,b,dg,kind); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
  PERFORM pg_temp.farkle_assert(denied,'future generic definer rejected for '||kind);
 END LOOP;
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET auto_fold=true WHERE id=a;
 SELECT intent_version INTO intent FROM public.players WHERE id=a;
 ans:=public.set_automatic_play(gid,rd,dg,a,intent,false);
 PERFORM pg_temp.farkle_assert(ans->>'deferred'='false' AND (SELECT NOT auto_fold AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=a),'out of turn reclaim is immediate');
 PERFORM set_config('app.farkle_authority',jsonb_build_object('game',gen_random_uuid(),'operation','action')::text,true);
 denied:=false; BEGIN UPDATE public.rounds SET pot=1 WHERE id=rd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'wrong game authority claim cannot mutate round');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET auto_fold=false WHERE id=b;
 s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 UPDATE public.games SET pending_session_end=true WHERE id=gid;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(peer_id);
 ans:=public.farkle_apply_action(rd,b,'bank',0,gen_random_uuid());
 PERFORM pg_temp.farkle_assert(ans->'settlement'->>'terminal_disposition'='session_ended'
 AND (SELECT status='session_ended' AND NOT pending_session_end AND session_ended_at IS NOT NULL FROM public.games WHERE id=gid)
 AND (SELECT sum(chips)=300 FROM public.players WHERE game_id=gid),'pending session end settles once and conserves chips');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'cleanup');
 DELETE FROM public.games WHERE id=gid;
 PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=gid)
 AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=gid)
 AND NOT EXISTS(SELECT 1 FROM private.farkle_events WHERE round_id=rd)
 AND NOT EXISTS(SELECT 1 FROM private.farkle_action_receipts WHERE round_id=rd),'fixture cascade removes configuration actions events and receipts');
 PERFORM set_config('app.farkle_authority','',true);
 UPDATE private.farkle_release SET creation_enabled=false,admin_only=true WHERE singleton;
END $proof$;

SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='3cd85a247c2cbcecf6f64ef05dc74052' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure),'candidate: definition owner grants configure_dealer_game');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='08008547a8c6728231ef68054ced5400' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.consume_automatic_play_stop()'::regprocedure),'candidate: definition owner grants consume_automatic_play_stop');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='a5244a4d537f034e8a125edf8e27a6eb' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure),'candidate: definition owner grants advance_ante_phase_exact');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='6a65b8a32ff86b01f9cc420a83e069a8' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.read_session_frame(uuid)'::regprocedure),'candidate: definition owner grants read_session_frame');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='e7c784e3fa2e412d3333ffd2355096f4' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure),'candidate: definition owner grants advance_due_canonical_game_timers');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='340cd2c6b16f12770242f39ebf53b6ff' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure),'candidate: definition owner grants set_automatic_play');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='ae070b19f465ca8c16c8700e48f7af34' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure),'candidate: definition owner grants set_game_paused');
SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; g uuid; dg uuid; rd uuid; p uuid; peer uuid; kind text; ctx text; r jsonb; v bigint;
 denied boolean; before_round jsonb; before_game jsonb; deadline timestamptz; after_deadline timestamptz; duration numeric;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active
 AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 2) q;
 IF cardinality(users)<2 THEN RAISE EXCEPTION 'proof:auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  deadline:=clock_timestamp()+interval '1 minute';
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback pause '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,current_turn_position,decision_deadline,presentation_fallback_at,horses_state,yahtzee_state)
   VALUES(g,dg,1,1,0,'betting',1,CASE WHEN kind IN ('cribbage','gin-rummy') THEN NULL ELSE deadline END,deadline,
   CASE WHEN kind IN ('horses','ship-captain-crew') THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END,
   CASE WHEN kind='yahtzee' THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END) RETURNING id INTO rd;
  IF kind='gin-rummy' THEN
   INSERT INTO private.gin_rummy_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','playing','playerStates','{}'::jsonb,'scoringDueAt',deadline,'completeDueAt',deadline,'botActionDueAt',deadline,'actionCount',0));
  ELSIF kind='cribbage' THEN
   INSERT INTO private.cribbage_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','counting','playerStates','{}'::jsonb,'countingResolution',jsonb_build_object('presentationReleaseAt',deadline-interval '5 seconds','presentationFallbackAt',deadline)));
  END IF;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'proof:peer_pause:%',r; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'paused' OR (r->>'pause_version')::bigint<>1 THEN RAISE EXCEPTION 'proof:pause:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_pause_replay'; END IF;
  r:=public.set_game_paused(g,true,dg,1);
  IF r->>'outcome'<>'already_set' THEN RAISE EXCEPTION 'proof:identical_pause'; END IF;
  SELECT to_jsonb(x) INTO before_round FROM public.rounds x WHERE id=rd;
  -- Direct action requests must fail before consuming any legal turn.
  denied:=false;
  BEGIN
   CASE kind
    WHEN '3-5-7' THEN r:=public.three_five_seven_submit_decision(g,rd,dg,1,1,p,'stay');
    WHEN 'holm-game' THEN r:=public.holm_submit_decision(g,rd,p,'stay');
    WHEN 'horses' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'ship-captain-crew' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'yahtzee' THEN r:=public.yahtzee_apply_action(rd,p,'roll',NULL,NULL,NULL,0);
    WHEN 'cribbage' THEN r:=public.cribbage_apply_discard(rd,p,ARRAY[0]);
    WHEN 'gin-rummy' THEN r:=public.gin_rummy_apply_action(rd,p,'draw_stock',NULL,NULL,0);
   END CASE;
   denied:=r->>'outcome' IN ('paused','game_paused') OR r->>'reason' IN ('paused','game-paused','round_not_current') OR coalesce((r->>'game_paused')::boolean,false);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%paus%' THEN RAISE; END IF;
   denied:=true;
  END;
  IF NOT coalesce(denied,false) OR (SELECT to_jsonb(x) FROM public.rounds x WHERE id=rd) IS DISTINCT FROM before_round THEN RAISE EXCEPTION 'proof:paused_action_mutated:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,false,dg,0);
  IF r->>'outcome'<>'stale_identity' OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:stale_resume'; END IF;
  EXECUTE 'RESET ROLE';
  -- The owner-role fallback is also barred: service identity cannot skip pause.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  denied:=false; BEGIN UPDATE public.rounds SET pot=pot+1 WHERE id=rd; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_round_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.games SET total_hands=total_hands+1 WHERE id=g; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_game_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.players SET chips=chips+1 WHERE id=p; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_money_bypass'; END IF;
  -- Advance only the synthetic pause clock; no real waiting or shared setting.
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds' WHERE id=g;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,false,dg,1);
  IF r->>'outcome'<>'resumed' OR (r->>'pause_version')::bigint<>2 THEN RAISE EXCEPTION 'proof:resume:%:%',kind,r; END IF;
  duration:=(r->>'paused_duration_seconds')::numeric;
  SELECT presentation_fallback_at INTO after_deadline FROM public.rounds WHERE id=rd;
  IF abs(extract(epoch FROM(after_deadline-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:lease_shift:%',kind; END IF;
  IF kind IN ('cribbage','gin-rummy') AND (SELECT decision_deadline IS NOT NULL FROM public.rounds WHERE id=rd) THEN RAISE EXCEPTION 'proof:invented_human_timer'; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' OR (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:late_pause'; END IF;
  r:=public.set_game_paused(g,true,gen_random_uuid(),2);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  EXECUTE 'RESET ROLE';
  IF kind='gin-rummy' AND abs(extract(epoch FROM ((SELECT (state->>'botActionDueAt')::timestamptz FROM private.gin_rummy_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:gin_due_shift'; END IF;
  IF kind='cribbage' AND abs(extract(epoch FROM ((SELECT (state->'countingResolution'->>'presentationFallbackAt')::timestamptz FROM private.cribbage_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:cribbage_due_shift'; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g) THEN RAISE EXCEPTION 'proof:pause_financial_change'; END IF;
  FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
   IF coalesce(current_setting(ctx,true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak:%',ctx; END IF; END LOOP;
 END LOOP;

 -- Ending neutral paused setup remains a control request, not gameplay.
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(gen_random_uuid(),'Rollback paused end',true,1);
 g:=(r->>'game_id')::uuid;
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET status='game_selection',config_deadline=clock_timestamp()+interval '1 minute' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.set_game_paused(g,true,NULL,0);
 r:=public.request_session_end(g,NULL,(SELECT timer_generation FROM public.games WHERE id=g));
 IF r->>'terminal_disposition'<>'session_ended' THEN RAISE EXCEPTION 'proof:paused_control_end'; END IF;
 r:=public.set_game_paused(g,false,NULL,1);
 IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:ended_resume'; END IF;
 EXECUTE 'RESET ROLE';
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: seven_game_pause_rollback_proof.sql');

SAVEPOINT existing_games;

-- Caller-owned rollback proof for the shared dealer configuration handoff.
-- Exercises every supported game plus authorization, validation, duplicate,
-- exact-identity replay, and late replay behavior.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_types text[]:=ARRAY['3-5-7','holm-game','cribbage','gin-rummy','horses','ship-captain-crew','yahtzee'];
  v_type text;
  v_game uuid;
  v_dealer_player uuid;
  v_other_player uuid;
  v_deadline timestamptz;
  v_config jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_dealer_game uuid;
  v_before jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT p.id,p.created_at FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at,p.id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'dealer_setup_proof:requires_two_profiles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);

  FOREACH v_type IN ARRAY v_types LOOP
    v_game:=gen_random_uuid();
    v_deadline:=clock_timestamp()+interval '20 minutes';
    INSERT INTO public.games(
      id,name,status,game_type,current_host,dealer_position,config_complete,
      config_deadline,ante_decision_timer_seconds,pot,current_round,total_hands
    ) VALUES(
      v_game,'Codex rollback proof - setup '||v_type,'game_selection',NULL,
      v_users[1],1,false,v_deadline,30,CASE WHEN v_type='cribbage' THEN 0 ELSE 9 END,0,0
    );
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision,current_decision,decision_locked,auto_fold)
    VALUES
      (v_game,v_users[1],1,100,'active',true,false,NULL,'fold',true,true),
      (v_game,v_users[2],2,100,'folded',false,false,'ante_up','stay',true,true);
    SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
    SELECT id INTO v_other_player FROM public.players WHERE game_id=v_game AND position=2;

    v_config:=CASE v_type
      WHEN '3-5-7' THEN '{"ante_amount":3,"rollover_amount":1,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"reveal_at_showdown":true}'::jsonb
      WHEN 'holm-game' THEN '{"ante_amount":2,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"chucky_cards":4,"rabbit_hunt":true}'::jsonb
      WHEN 'cribbage' THEN '{"ante_amount":2,"points_to_win":121,"skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61,"game_mode":"full"}'::jsonb
      WHEN 'gin-rummy' THEN '{"ante_amount":2,"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}'::jsonb
      ELSE '{"ante_amount":2}'::jsonb
    END;

    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.games SET ante_amount=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_ante_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET points_to_win=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_scoring_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET game_setup_timer_seconds=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_timer_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET dealer_selection_state='{"isComplete":true,"winnerPosition":1}'::jsonb WHERE id=v_game;
      RAISE EXCEPTION 'direct_draw_forgery_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
      VALUES(v_game,v_users[1],v_type,v_config);
      RAISE EXCEPTION 'direct_dealer_game_insert_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_result;
    RESET ROLE;
    v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
    IF v_result->>'outcome'<>'configured' OR coalesce((v_result->>'deduped')::boolean,true)
       OR (v_result#>>'{game,status}')<>'ante_decision'
       OR (v_result#>>'{game,current_game_uuid}')::uuid<>v_dealer_game
       OR v_result#>>'{game,ante_decision_deadline}' IS NULL
       OR v_result#>>'{game,config_deadline}' IS NOT NULL
       OR (v_result#>>'{dealer_game,game_type}')<>v_type
       OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up'
       OR (SELECT sitting_out FROM public.players WHERE id=v_dealer_player)
       OR (SELECT ante_decision FROM public.players WHERE id=v_other_player) IS NOT NULL
       OR (SELECT status FROM public.players WHERE id=v_other_player)<>'active'
       OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND (current_decision IS NOT NULL OR decision_locked OR auto_fold))
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1
       OR (SELECT count(*) FROM private.dealer_game_setup_commits WHERE game_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:atomic_handoff_invalid:%:%',v_type,v_result;
    END IF;
    IF (v_type='3-5-7' AND (
          (v_result#>>'{game,rollover_amount}')::integer<>1
          OR (v_result#>>'{game,leg_value}')::integer<>2
          OR (v_result#>>'{game,reveal_at_showdown}')::boolean IS NOT TRUE
       ))
       OR (v_type='holm-game' AND (
          (v_result#>>'{game,current_round}')::integer<>1
          OR (v_result#>>'{game,chucky_cards}')::integer<>4
          OR (v_result#>>'{game,rabbit_hunt}')::boolean IS NOT TRUE
       ))
       OR (v_type='cribbage' AND (
          (v_result#>>'{game,pot}')::integer<>0
          OR (v_result#>>'{game,points_to_win}')::integer<>121
          OR (v_result#>>'{game,skunk_threshold}')::integer<>91
       ))
       OR (v_type='gin-rummy' AND (
          (v_result#>>'{game,points_to_win}')::integer<>100
          OR (v_result#>>'{dealer_game,config,gin_bonus}')::integer<>25
       ))
       OR (v_type IN ('horses','ship-captain-crew','yahtzee') AND (
          (v_result#>>'{game,leg_value}')::integer<>0
          OR (v_result#>>'{game,pot_max_enabled}')::boolean IS NOT FALSE
       )) THEN
      RAISE EXCEPTION 'dealer_setup_proof:game_specific_state_invalid:%:%',v_type,v_result;
    END IF;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_replay;
    IF v_replay->>'outcome'<>'already_configured' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
       OR (v_replay#>>'{dealer_game,id}')::uuid<>v_dealer_game
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:duplicate_changed_state:%:%',v_type,v_replay;
    END IF;
    IF v_type='yahtzee' THEN
      BEGIN
        PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,v_type,'{"ante_amount":3}'::jsonb,v_deadline);
        RAISE EXCEPTION 'dealer_setup_proof:mismatched_replay_succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='dealer_setup_proof:mismatched_replay_succeeded'
           OR SQLERRM NOT LIKE '%replay_payload_mismatch%' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;

  -- Unauthorized callers cannot create a setup commit.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - unauthorized','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider)::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:outsider_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:outsider_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:unauthorized_call_partially_mutated';
  END IF;

  -- Invalid configuration is atomic and creates no dealer-game row or claim.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'3-5-7','{"ante_amount":3,"rollover_amount":0}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:invalid_config_succeeded' OR SQLERRM NOT LIKE '%invalid_card_game_config%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game)
     OR EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_partially_mutated';
  END IF;

  -- A human session member may configure an eligible bot dealer. The bot's
  -- user identity, not the caller identity, owns the dealer-game row.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - bot dealer','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[2],1,100,'active',true),(v_game,v_users[1],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  IF (v_result#>>'{dealer_game,dealer_user_id}')::uuid<>v_users[2]
     OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up' THEN
    RAISE EXCEPTION 'dealer_setup_proof:bot_dealer_invalid:%',v_result;
  END IF;

  -- Late replay returns its stored result and cannot overwrite a newer setup.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - late replay','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET status='game_selection',dealer_position=2,
    config_complete=false,config_deadline=v_deadline+interval '1 hour',current_game_uuid=NULL
   WHERE id=v_game;
  SELECT to_jsonb(game) INTO v_before FROM public.games game WHERE id=v_game;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_replay;
  IF v_replay->>'outcome'<>'already_configured'
     OR (SELECT to_jsonb(game) FROM public.games game WHERE id=v_game) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'dealer_setup_proof:late_replay_mutated_newer_setup:%',v_replay;
  END IF;

  SELECT count(*) INTO v_count FROM private.dealer_game_setup_commits;
  IF v_count<9 THEN RAISE EXCEPTION 'dealer_setup_proof:missing_claims:%',v_count; END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: rule_configuration_authority_rollback_proof.sql');

SAVEPOINT existing_games;
SELECT set_config('app.three_five_seven_test_no_sweep','on',true);
-- Caller-owned rollback proof for the authenticated ante-decision request
-- boundary. The caller must apply the candidate migration in the same
-- transaction for the pre-deployment proof, then wrap this file in
-- BEGIN/ROLLBACK for the post-deployment proof.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_357_sit uuid:=gen_random_uuid();
  v_357_start uuid:=gen_random_uuid();
  v_yahtzee_sit uuid:=gen_random_uuid();
  v_deadline_357_sit timestamptz:=clock_timestamp()+interval '20 minutes';
  v_deadline_357_start timestamptz:=clock_timestamp()+interval '21 minutes';
  v_deadline_yahtzee_sit timestamptz:=clock_timestamp()+interval '22 minutes';
  v_dealer uuid;
  v_other uuid;
  v_dealer_game uuid;
  v_result jsonb;
  v_before_rounds integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'ante_authority_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES
    (v_357_sit,'Codex rollback proof - 357 Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_sit,30,30,0,0,0,false),
    (v_357_start,'Codex rollback proof - 357 start','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_start,30,30,0,0,0,false),
    (v_yahtzee_sit,'Codex rollback proof - Yahtzee Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_yahtzee_sit,30,30,0,0,0,false);

  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_357_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_357_sit,v_users[2],2,100,'active',false,false,NULL),
    (v_357_start,v_users[1],1,100,'active',false,false,NULL),
    (v_357_start,v_users[2],2,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[2],2,100,'active',false,false,NULL);

  -- 3-5-7 final Sit Out: setup and ante submission are separate HTTP
  -- transactions. Explicitly clear every setup authority flag before the
  -- second call so this proof cannot inherit setup's trusted context.
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_357_sit,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);

  -- Authorization remains in the public wrapper and cannot partially mutate.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL
     OR coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:unauthorized_357_sit_mutated:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR v_result#>>'{phase,reason}'<>'waiting-not-enough-players'
     OR (SELECT status FROM public.games WHERE id=v_357_sit)<>'waiting'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_357_sit) IS NOT NULL
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_not_committed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_sit)<>0 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_replay_changed_state:%',v_result;
  END IF;

  -- The same protected branch must work for Yahtzee without weakening its
  -- game-authority trigger.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_yahtzee_sit,v_dealer,1,'yahtzee',jsonb_build_object('ante_amount',3),
    v_deadline_yahtzee_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_yahtzee_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR (SELECT status FROM public.games WHERE id=v_yahtzee_sit)<>'waiting'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_not_committed:%',v_result;
  END IF;

  -- Normal 3-5-7 continuation remains exactly once and replay safe.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_start AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_start AND position=2;
  SELECT public.configure_dealer_game(
    v_357_start,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_start
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT count(*) INTO v_before_rounds FROM public.rounds
   WHERE game_id=v_357_start;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_357_start)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_failed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_replay_changed_state:%',v_result;
  END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: ante_decision_authority_boundary_rollback_proof.sql');

SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; req uuid:=gen_random_uuid(); g uuid; p uuid; peer uuid; dg uuid; rd uuid; r jsonb; v bigint;
 denied boolean; gen bigint; kind text; ctx text; before_count bigint;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
 WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 3) q;
 IF cardinality(users)<3 THEN RAISE EXCEPTION 'proof:three_auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 g:=(r->>'game_id')::uuid; p:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'created' OR (SELECT current_host FROM public.games WHERE id=g) IS DISTINCT FROM users[1]
 OR (SELECT count(*) FROM public.players WHERE game_id=g)<>1 OR (SELECT chips FROM public.players WHERE id=p)<>0
 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:atomic_genesis:%',r; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_created' OR (r->>'game_id')::uuid<>g THEN RAISE EXCEPTION 'proof:create_duplicate'; END IF;
 denied:=false; BEGIN PERFORM public.create_session(req,'Different payload',true,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_payload_replay'; END IF;
 SELECT count(*) INTO before_count FROM public.games;
 denied:=false; BEGIN PERFORM public.create_session(gen_random_uuid(),'Invalid seat',false,8); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR (SELECT count(*) FROM public.games)<>before_count THEN RAISE EXCEPTION 'proof:creation_failure_orphan'; END IF;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money) VALUES('Raw creation denied','waiting',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_genesis'; END IF;
 denied:=false; BEGIN UPDATE public.players SET auto_fold=true WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_gameplay'; END IF;
 denied:=false; BEGIN DELETE FROM public.players WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_delete'; END IF;
 denied:=false; BEGIN INSERT INTO public.players(game_id,user_id,chips,position) VALUES(g,users[1],0,3); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_player_genesis'; END IF;
 UPDATE public.players SET deck_color_mode='four_color' WHERE id=p;
 IF (SELECT deck_color_mode FROM public.players WHERE id=p)<>'four_color' THEN RAISE EXCEPTION 'proof:own_color'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.create_session(req,'Rollback atomic creation',false,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_actor_replay'; END IF;
 UPDATE public.players SET deck_color_mode='two_color' WHERE id=p;
 IF FOUND THEN RAISE EXCEPTION 'proof:peer_color'; END IF;
 r:=public.session_take_seat(g,4,NULL,NULL); peer:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'proof:admission'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'deleted' THEN RAISE EXCEPTION 'proof:fake_cleanup'; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_deleted' OR r->>'game_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:late_creation_resurrected'; END IF;
 EXECUTE 'RESET ROLE';

 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback automatic play '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
   VALUES(g,dg,1,1,'betting',0,jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p)) RETURNING id INTO rd;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  denied:=false; BEGIN PERFORM public.set_automatic_play(g,rd,dg,peer,0,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:peer_automatic_play:%',kind; END IF;
  r:=public.set_automatic_play(g,rd,gen_random_uuid(),p,v,true);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,true);
  IF r->>'outcome'<>'accepted' OR NOT (r->'player'->>'auto_fold')::boolean THEN RAISE EXCEPTION 'proof:enable:%:%',kind,r; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_intent'; END IF;
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:disable:%',kind; END IF;
  IF kind IN ('horses','ship-captain-crew') THEN
   IF NOT (r->>'deferred')::boolean OR NOT (r->'player'->>'auto_fold')::boolean OR (r->'player'->>'auto_play_stop_round_id')::uuid<>rd THEN RAISE EXCEPTION 'proof:deferred_request'; END IF;
   -- Duplicate old disable cannot override a newer deliberate enable.
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:queue_version'; END IF;
   EXECUTE 'RESET ROLE';
   -- No connected browser action: server turn advance alone consumes the intent.
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(peer::text)) WHERE id=rd;
   IF (SELECT auto_fold OR auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:disconnect_stop_lost'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
  ELSIF (r->'player'->>'auto_fold')::boolean OR (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:immediate_stop:%',kind;
  END IF;
  EXECUTE 'RESET ROLE';
  IF kind IN ('horses','ship-captain-crew') THEN
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(p::text)) WHERE id=rd;
   UPDATE public.games SET is_paused=true WHERE id=g;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF NOT (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:paused_stop'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   IF r->'player'->>'auto_play_stop_round_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:enable_did_not_cancel_stop'; END IF;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_stop_overrode_enable'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   EXECUTE 'RESET ROLE';
   -- A delayed old-round completion must never disable automation in a new dealer game.
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
   UPDATE public.games SET is_paused=false WHERE id=g;
   UPDATE public.games SET current_game_uuid=dg WHERE id=g;
   UPDATE public.rounds SET status='completed' WHERE id=rd;
   IF NOT (SELECT auto_fold FROM public.players WHERE id=p) OR
    (SELECT auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:cross_identity_stop'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:completed_round_toggle'; END IF;
   EXECUTE 'RESET ROLE';
  END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:money_changed'; END IF;
  IF coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak'; END IF;
 END LOOP;
 -- Preference arguments cannot bypass the mutually exclusive server intent.
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.submit_ante_decision(g,dg,p,'ante_up',true,true); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:conflicting_ante_preferences'; END IF;
 EXECUTE 'RESET ROLE';
 IF has_table_privilege('authenticated','public.players','UPDATE') OR has_table_privilege('authenticated','public.games','INSERT')
 OR has_column_privilege('authenticated','public.players','chips','UPDATE')
 OR has_column_privilege('authenticated','public.players','auto_play_stop_round_id','UPDATE')
 THEN RAISE EXCEPTION 'proof:privilege_closure'; END IF;
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: final_player_authority_rollback_proof.sql');

-- Atomic recovery: exclusive ownership waits for all in-flight creators.
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
DO $gate$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress')) THEN RAISE EXCEPTION 'farkle:active_games_require_compatible_recovery'; END IF;
END $gate$;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure)) NOT IN ('9fc99d2870622c8bb0aebe5a78e7f00f','3cd85a247c2cbcecf6f64ef05dc74052') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:configure_dealer_game'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee'
  ) THEN
    RAISE EXCEPTION 'configure_dealer_game:unsupported_game_type:%',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_config_document';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'configure_dealer_game:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.configure_dealer_game',false,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'configure_dealer_game:game_not_found'; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'configure_dealer_game:not_in_session';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_ante';
  END IF;
  v_ante := (p_config->>'ante_amount')::integer;
  v_request_hash := md5(concat_ws('|',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'configure_dealer_game:replay_payload_mismatch';
    END IF;
    v_replay_return := v_claim.result || jsonb_build_object('outcome','already_configured','deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:game_paused';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:session_ending';
  END IF;
  IF v_game.status NOT IN ('game_selection','configuring') THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_phase:%',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:setup_identity_mismatch';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_position_mismatch';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:configuration_expired';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_identity_mismatch';
  END IF;
  IF v_dealer.status IN ('left','eliminated') THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_not_eligible';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_authorization_required';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN ('3-5-7','holm-game') THEN
    IF coalesce(p_config->>'leg_value','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'legs_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'pussy_tax_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'pot_max_enabled','false') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_config';
    END IF;
    v_leg := (p_config->>'leg_value')::integer;
    v_legs := (p_config->>'legs_to_win')::integer;
    v_pussy_enabled := coalesce((p_config->>'pussy_tax_enabled')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>'pot_max_enabled')::boolean,false);
    IF coalesce(p_config->>'pussy_tax_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'pot_max_value','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_amount';
    END IF;
    v_pussy_value := (p_config->>'pussy_tax_value')::integer;
    v_pot_max_value := (p_config->>'pot_max_value')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION 'configure_dealer_game:enabled_amount_must_be_positive';
    END IF;
    IF p_game_type='3-5-7' THEN
      IF coalesce(p_config->>'rollover_amount','') !~ '^[1-9][0-9]*$'
         OR coalesce(p_config->>'reveal_at_showdown','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_357_config';
      END IF;
      v_rollover := (p_config->>'rollover_amount')::integer;
      v_reveal := coalesce((p_config->>'reveal_at_showdown')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',v_rollover,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',NULL,'rabbit_hunt',NULL,
        'reveal_at_showdown',v_reveal
      );
    ELSE
      IF coalesce(p_config->>'chucky_cards','') !~ '^[0-9]+$'
         OR coalesce(p_config->>'rabbit_hunt','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_holm_config';
      END IF;
      v_chucky := (p_config->>'chucky_cards')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_chucky_count';
      END IF;
      v_rabbit := coalesce((p_config->>'rabbit_hunt')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',NULL,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',v_chucky,
        'rabbit_hunt',v_rabbit,'reveal_at_showdown',NULL
      );
    END IF;
  ELSIF p_game_type='cribbage' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'double_skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'skunk_threshold','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'double_skunk_threshold','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_skunk_enabled := (p_config->>'skunk_enabled')::boolean;
    v_double_skunk_enabled := (p_config->>'double_skunk_enabled')::boolean;
    v_skunk_threshold := (p_config->>'skunk_threshold')::integer;
    v_double_skunk_threshold := (p_config->>'double_skunk_threshold')::integer;
    v_game_mode := coalesce(p_config->>'game_mode','full');
    IF v_game_mode NOT IN ('full','half','super_quick','sprint','custom')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_thresholds';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'skunk_enabled',v_skunk_enabled,
      'skunk_threshold',v_skunk_threshold,'double_skunk_enabled',v_double_skunk_enabled,
      'double_skunk_threshold',v_double_skunk_threshold,'game_mode',v_game_mode
    );
    IF v_game_mode='custom' THEN
      v_config:=v_config||jsonb_build_object('custom_points_to_win',v_points);
    END IF;
  ELSIF p_game_type='gin-rummy' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'per_point_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'gin_bonus','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'undercut_bonus','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_gin_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_per_point := (p_config->>'per_point_value')::integer;
    v_gin_bonus := (p_config->>'gin_bonus')::integer;
    v_undercut_bonus := (p_config->>'undercut_bonus')::integer;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'per_point_value',v_per_point,
      'gin_bonus',v_gin_bonus,'undercut_bonus',v_undercut_bonus
    );
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status='folded' THEN 'active' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>'left';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         replay_contract_version=CASE WHEN p_game_type='gin-rummy' THEN game.replay_contract_version ELSE NULL END,
         ante_amount=v_ante,
         config_complete=true,
         status='ante_decision',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type='3-5-7' THEN v_rollover WHEN p_game_type='holm-game' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type='holm-game' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type='holm-game' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type='3-5-7' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN ('cribbage','gin-rummy') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type='cribbage' THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type='cribbage' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN ('holm-game','cribbage') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type='holm-game' THEN 1 WHEN p_game_type='3-5-7' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),'[]'::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    'outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',p_game_id,'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(v_game),'dealer_game',to_jsonb(v_dealer_game),'players',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  v_replay_return := v_result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO postgres;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.consume_automatic_play_stop()'::regprocedure)) NOT IN ('9a9044ce522cd73b9980f0b7e87f774b','08008547a8c6728231ef68054ced5400') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:consume_automatic_play_stop'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.consume_automatic_play_stop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; prior text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE auto_play_stop_round_id=NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_fold=CASE WHEN g.current_game_uuid=NEW.dealer_game_id AND g.current_round=NEW.round_number
 AND g.total_hands=NEW.hand_number THEN false ELSE auto_fold END,
 auto_play_stop_round_id=NULL
 WHERE game_id=NEW.game_id AND auto_play_stop_round_id=NEW.id
 AND (NEW.status='completed' OR NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing'
 OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN NEW;
END $function$
;
ALTER FUNCTION private.consume_automatic_play_stop() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.consume_automatic_play_stop() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.consume_automatic_play_stop() TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure)) NOT IN ('011e5fbde8d7e98badd420ea448c841e','a5244a4d537f034e8a125edf8e27a6eb') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:advance_ante_phase_exact'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
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
 RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

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
 RETURN v_replay_return;
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
 RETURN v_replay_return;
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
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.read_session_frame(uuid)'::regprocedure)) NOT IN ('78597533f2f3e4870b47d1c5b1e5fbd9','6a65b8a32ff86b01f9cc420a83e069a8') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:read_session_frame'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.read_session_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_frame:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'game',to_jsonb(g)||jsonb_build_object('_authorityRevision',private.session_authority_revision(g.id),
    'rounds',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       'horses_state',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'yahtzee_state',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),'[]'::jsonb)),
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('username',pr.username,'aggression_level',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>'left'),'[]'::jsonb),
  'allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
  'server_now',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $function$
;
ALTER FUNCTION public.read_session_frame(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_session_frame(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_due_canonical_game_timers(integer)'::regprocedure)) NOT IN ('edd034879df909e97dca92c715a4ab3a','e7c784e3fa2e412d3333ffd2355096f4') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:advance_due_canonical_game_timers'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure)) NOT IN ('aae98932bd835c45f9d3761c912266bd','340cd2c6b16f12770242f39ebf53b6ff') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:set_automatic_play'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_automatic_play',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure)) NOT IN ('7a8472b77a2805bf1d6e562b3166cfb7','ae070b19f465ca8c16c8700e48f7af34') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:set_game_paused'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_game_paused',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;

SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='9fc99d2870622c8bb0aebe5a78e7f00f' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure),'recovery 1: definition owner grants configure_dealer_game');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='9a9044ce522cd73b9980f0b7e87f774b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.consume_automatic_play_stop()'::regprocedure),'recovery 1: definition owner grants consume_automatic_play_stop');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='011e5fbde8d7e98badd420ea448c841e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure),'recovery 1: definition owner grants advance_ante_phase_exact');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='78597533f2f3e4870b47d1c5b1e5fbd9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.read_session_frame(uuid)'::regprocedure),'recovery 1: definition owner grants read_session_frame');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='edd034879df909e97dca92c715a4ab3a' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure),'recovery 1: definition owner grants advance_due_canonical_game_timers');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='aae98932bd835c45f9d3761c912266bd' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure),'recovery 1: definition owner grants set_automatic_play');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='7a8472b77a2805bf1d6e562b3166cfb7' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure),'recovery 1: definition owner grants set_game_paused');
DO $disabled$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM private.farkle_resolve_config_v1(NULL::public.games,'{}'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:creation_disabled'; END;
 PERFORM pg_temp.farkle_assert(denied,'creator after recovery sees disabled gate');
END $disabled$;
-- Atomic recovery: exclusive ownership waits for all in-flight creators.
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
DO $gate$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress')) THEN RAISE EXCEPTION 'farkle:active_games_require_compatible_recovery'; END IF;
END $gate$;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure)) NOT IN ('9fc99d2870622c8bb0aebe5a78e7f00f','3cd85a247c2cbcecf6f64ef05dc74052') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:configure_dealer_game'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee'
  ) THEN
    RAISE EXCEPTION 'configure_dealer_game:unsupported_game_type:%',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_config_document';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'configure_dealer_game:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.configure_dealer_game',false,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'configure_dealer_game:game_not_found'; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'configure_dealer_game:not_in_session';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_ante';
  END IF;
  v_ante := (p_config->>'ante_amount')::integer;
  v_request_hash := md5(concat_ws('|',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'configure_dealer_game:replay_payload_mismatch';
    END IF;
    v_replay_return := v_claim.result || jsonb_build_object('outcome','already_configured','deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:game_paused';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:session_ending';
  END IF;
  IF v_game.status NOT IN ('game_selection','configuring') THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_phase:%',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:setup_identity_mismatch';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_position_mismatch';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:configuration_expired';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_identity_mismatch';
  END IF;
  IF v_dealer.status IN ('left','eliminated') THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_not_eligible';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_authorization_required';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN ('3-5-7','holm-game') THEN
    IF coalesce(p_config->>'leg_value','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'legs_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'pussy_tax_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'pot_max_enabled','false') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_config';
    END IF;
    v_leg := (p_config->>'leg_value')::integer;
    v_legs := (p_config->>'legs_to_win')::integer;
    v_pussy_enabled := coalesce((p_config->>'pussy_tax_enabled')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>'pot_max_enabled')::boolean,false);
    IF coalesce(p_config->>'pussy_tax_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'pot_max_value','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_amount';
    END IF;
    v_pussy_value := (p_config->>'pussy_tax_value')::integer;
    v_pot_max_value := (p_config->>'pot_max_value')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION 'configure_dealer_game:enabled_amount_must_be_positive';
    END IF;
    IF p_game_type='3-5-7' THEN
      IF coalesce(p_config->>'rollover_amount','') !~ '^[1-9][0-9]*$'
         OR coalesce(p_config->>'reveal_at_showdown','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_357_config';
      END IF;
      v_rollover := (p_config->>'rollover_amount')::integer;
      v_reveal := coalesce((p_config->>'reveal_at_showdown')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',v_rollover,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',NULL,'rabbit_hunt',NULL,
        'reveal_at_showdown',v_reveal
      );
    ELSE
      IF coalesce(p_config->>'chucky_cards','') !~ '^[0-9]+$'
         OR coalesce(p_config->>'rabbit_hunt','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_holm_config';
      END IF;
      v_chucky := (p_config->>'chucky_cards')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_chucky_count';
      END IF;
      v_rabbit := coalesce((p_config->>'rabbit_hunt')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',NULL,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',v_chucky,
        'rabbit_hunt',v_rabbit,'reveal_at_showdown',NULL
      );
    END IF;
  ELSIF p_game_type='cribbage' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'double_skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'skunk_threshold','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'double_skunk_threshold','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_skunk_enabled := (p_config->>'skunk_enabled')::boolean;
    v_double_skunk_enabled := (p_config->>'double_skunk_enabled')::boolean;
    v_skunk_threshold := (p_config->>'skunk_threshold')::integer;
    v_double_skunk_threshold := (p_config->>'double_skunk_threshold')::integer;
    v_game_mode := coalesce(p_config->>'game_mode','full');
    IF v_game_mode NOT IN ('full','half','super_quick','sprint','custom')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_thresholds';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'skunk_enabled',v_skunk_enabled,
      'skunk_threshold',v_skunk_threshold,'double_skunk_enabled',v_double_skunk_enabled,
      'double_skunk_threshold',v_double_skunk_threshold,'game_mode',v_game_mode
    );
    IF v_game_mode='custom' THEN
      v_config:=v_config||jsonb_build_object('custom_points_to_win',v_points);
    END IF;
  ELSIF p_game_type='gin-rummy' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'per_point_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'gin_bonus','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'undercut_bonus','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_gin_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_per_point := (p_config->>'per_point_value')::integer;
    v_gin_bonus := (p_config->>'gin_bonus')::integer;
    v_undercut_bonus := (p_config->>'undercut_bonus')::integer;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'per_point_value',v_per_point,
      'gin_bonus',v_gin_bonus,'undercut_bonus',v_undercut_bonus
    );
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status='folded' THEN 'active' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>'left';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         replay_contract_version=CASE WHEN p_game_type='gin-rummy' THEN game.replay_contract_version ELSE NULL END,
         ante_amount=v_ante,
         config_complete=true,
         status='ante_decision',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type='3-5-7' THEN v_rollover WHEN p_game_type='holm-game' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type='holm-game' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type='holm-game' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type='3-5-7' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN ('cribbage','gin-rummy') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type='cribbage' THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type='cribbage' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN ('holm-game','cribbage') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type='holm-game' THEN 1 WHEN p_game_type='3-5-7' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),'[]'::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    'outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',p_game_id,'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(v_game),'dealer_game',to_jsonb(v_dealer_game),'players',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  v_replay_return := v_result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO postgres;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.consume_automatic_play_stop()'::regprocedure)) NOT IN ('9a9044ce522cd73b9980f0b7e87f774b','08008547a8c6728231ef68054ced5400') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:consume_automatic_play_stop'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.consume_automatic_play_stop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; prior text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE auto_play_stop_round_id=NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_fold=CASE WHEN g.current_game_uuid=NEW.dealer_game_id AND g.current_round=NEW.round_number
 AND g.total_hands=NEW.hand_number THEN false ELSE auto_fold END,
 auto_play_stop_round_id=NULL
 WHERE game_id=NEW.game_id AND auto_play_stop_round_id=NEW.id
 AND (NEW.status='completed' OR NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing'
 OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN NEW;
END $function$
;
ALTER FUNCTION private.consume_automatic_play_stop() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.consume_automatic_play_stop() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.consume_automatic_play_stop() TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure)) NOT IN ('011e5fbde8d7e98badd420ea448c841e','a5244a4d537f034e8a125edf8e27a6eb') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:advance_ante_phase_exact'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
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
 RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

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
 RETURN v_replay_return;
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
 RETURN v_replay_return;
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
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.read_session_frame(uuid)'::regprocedure)) NOT IN ('78597533f2f3e4870b47d1c5b1e5fbd9','6a65b8a32ff86b01f9cc420a83e069a8') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:read_session_frame'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.read_session_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_frame:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'game',to_jsonb(g)||jsonb_build_object('_authorityRevision',private.session_authority_revision(g.id),
    'rounds',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       'horses_state',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'yahtzee_state',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),'[]'::jsonb)),
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('username',pr.username,'aggression_level',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>'left'),'[]'::jsonb),
  'allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
  'server_now',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $function$
;
ALTER FUNCTION public.read_session_frame(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_session_frame(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_due_canonical_game_timers(integer)'::regprocedure)) NOT IN ('edd034879df909e97dca92c715a4ab3a','e7c784e3fa2e412d3333ffd2355096f4') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:advance_due_canonical_game_timers'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure)) NOT IN ('aae98932bd835c45f9d3761c912266bd','340cd2c6b16f12770242f39ebf53b6ff') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:set_automatic_play'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_automatic_play',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure)) NOT IN ('7a8472b77a2805bf1d6e562b3166cfb7','ae070b19f465ca8c16c8700e48f7af34') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:set_game_paused'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_game_paused',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;

SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='9fc99d2870622c8bb0aebe5a78e7f00f' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure),'recovery 2: definition owner grants configure_dealer_game');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='9a9044ce522cd73b9980f0b7e87f774b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.consume_automatic_play_stop()'::regprocedure),'recovery 2: definition owner grants consume_automatic_play_stop');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='011e5fbde8d7e98badd420ea448c841e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure),'recovery 2: definition owner grants advance_ante_phase_exact');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='78597533f2f3e4870b47d1c5b1e5fbd9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.read_session_frame(uuid)'::regprocedure),'recovery 2: definition owner grants read_session_frame');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='edd034879df909e97dca92c715a4ab3a' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure),'recovery 2: definition owner grants advance_due_canonical_game_timers');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='aae98932bd835c45f9d3761c912266bd' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure),'recovery 2: definition owner grants set_automatic_play');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='7a8472b77a2805bf1d6e562b3166cfb7' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure),'recovery 2: definition owner grants set_game_paused');
SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; g uuid; dg uuid; rd uuid; p uuid; peer uuid; kind text; ctx text; r jsonb; v bigint;
 denied boolean; before_round jsonb; before_game jsonb; deadline timestamptz; after_deadline timestamptz; duration numeric;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active
 AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 2) q;
 IF cardinality(users)<2 THEN RAISE EXCEPTION 'proof:auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  deadline:=clock_timestamp()+interval '1 minute';
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback pause '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,current_turn_position,decision_deadline,presentation_fallback_at,horses_state,yahtzee_state)
   VALUES(g,dg,1,1,0,'betting',1,CASE WHEN kind IN ('cribbage','gin-rummy') THEN NULL ELSE deadline END,deadline,
   CASE WHEN kind IN ('horses','ship-captain-crew') THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END,
   CASE WHEN kind='yahtzee' THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END) RETURNING id INTO rd;
  IF kind='gin-rummy' THEN
   INSERT INTO private.gin_rummy_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','playing','playerStates','{}'::jsonb,'scoringDueAt',deadline,'completeDueAt',deadline,'botActionDueAt',deadline,'actionCount',0));
  ELSIF kind='cribbage' THEN
   INSERT INTO private.cribbage_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','counting','playerStates','{}'::jsonb,'countingResolution',jsonb_build_object('presentationReleaseAt',deadline-interval '5 seconds','presentationFallbackAt',deadline)));
  END IF;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'proof:peer_pause:%',r; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'paused' OR (r->>'pause_version')::bigint<>1 THEN RAISE EXCEPTION 'proof:pause:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_pause_replay'; END IF;
  r:=public.set_game_paused(g,true,dg,1);
  IF r->>'outcome'<>'already_set' THEN RAISE EXCEPTION 'proof:identical_pause'; END IF;
  SELECT to_jsonb(x) INTO before_round FROM public.rounds x WHERE id=rd;
  -- Direct action requests must fail before consuming any legal turn.
  denied:=false;
  BEGIN
   CASE kind
    WHEN '3-5-7' THEN r:=public.three_five_seven_submit_decision(g,rd,dg,1,1,p,'stay');
    WHEN 'holm-game' THEN r:=public.holm_submit_decision(g,rd,p,'stay');
    WHEN 'horses' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'ship-captain-crew' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'yahtzee' THEN r:=public.yahtzee_apply_action(rd,p,'roll',NULL,NULL,NULL,0);
    WHEN 'cribbage' THEN r:=public.cribbage_apply_discard(rd,p,ARRAY[0]);
    WHEN 'gin-rummy' THEN r:=public.gin_rummy_apply_action(rd,p,'draw_stock',NULL,NULL,0);
   END CASE;
   denied:=r->>'outcome' IN ('paused','game_paused') OR r->>'reason' IN ('paused','game-paused','round_not_current') OR coalesce((r->>'game_paused')::boolean,false);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%paus%' THEN RAISE; END IF;
   denied:=true;
  END;
  IF NOT coalesce(denied,false) OR (SELECT to_jsonb(x) FROM public.rounds x WHERE id=rd) IS DISTINCT FROM before_round THEN RAISE EXCEPTION 'proof:paused_action_mutated:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,false,dg,0);
  IF r->>'outcome'<>'stale_identity' OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:stale_resume'; END IF;
  EXECUTE 'RESET ROLE';
  -- The owner-role fallback is also barred: service identity cannot skip pause.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  denied:=false; BEGIN UPDATE public.rounds SET pot=pot+1 WHERE id=rd; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_round_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.games SET total_hands=total_hands+1 WHERE id=g; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_game_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.players SET chips=chips+1 WHERE id=p; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_money_bypass'; END IF;
  -- Advance only the synthetic pause clock; no real waiting or shared setting.
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds' WHERE id=g;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,false,dg,1);
  IF r->>'outcome'<>'resumed' OR (r->>'pause_version')::bigint<>2 THEN RAISE EXCEPTION 'proof:resume:%:%',kind,r; END IF;
  duration:=(r->>'paused_duration_seconds')::numeric;
  SELECT presentation_fallback_at INTO after_deadline FROM public.rounds WHERE id=rd;
  IF abs(extract(epoch FROM(after_deadline-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:lease_shift:%',kind; END IF;
  IF kind IN ('cribbage','gin-rummy') AND (SELECT decision_deadline IS NOT NULL FROM public.rounds WHERE id=rd) THEN RAISE EXCEPTION 'proof:invented_human_timer'; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' OR (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:late_pause'; END IF;
  r:=public.set_game_paused(g,true,gen_random_uuid(),2);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  EXECUTE 'RESET ROLE';
  IF kind='gin-rummy' AND abs(extract(epoch FROM ((SELECT (state->>'botActionDueAt')::timestamptz FROM private.gin_rummy_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:gin_due_shift'; END IF;
  IF kind='cribbage' AND abs(extract(epoch FROM ((SELECT (state->'countingResolution'->>'presentationFallbackAt')::timestamptz FROM private.cribbage_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:cribbage_due_shift'; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g) THEN RAISE EXCEPTION 'proof:pause_financial_change'; END IF;
  FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
   IF coalesce(current_setting(ctx,true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak:%',ctx; END IF; END LOOP;
 END LOOP;

 -- Ending neutral paused setup remains a control request, not gameplay.
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(gen_random_uuid(),'Rollback paused end',true,1);
 g:=(r->>'game_id')::uuid;
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET status='game_selection',config_deadline=clock_timestamp()+interval '1 minute' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.set_game_paused(g,true,NULL,0);
 r:=public.request_session_end(g,NULL,(SELECT timer_generation FROM public.games WHERE id=g));
 IF r->>'terminal_disposition'<>'session_ended' THEN RAISE EXCEPTION 'proof:paused_control_end'; END IF;
 r:=public.set_game_paused(g,false,NULL,1);
 IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:ended_resume'; END IF;
 EXECUTE 'RESET ROLE';
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'restored: seven_game_pause_rollback_proof.sql');

SAVEPOINT existing_games;

-- Caller-owned rollback proof for the shared dealer configuration handoff.
-- Exercises every supported game plus authorization, validation, duplicate,
-- exact-identity replay, and late replay behavior.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_types text[]:=ARRAY['3-5-7','holm-game','cribbage','gin-rummy','horses','ship-captain-crew','yahtzee'];
  v_type text;
  v_game uuid;
  v_dealer_player uuid;
  v_other_player uuid;
  v_deadline timestamptz;
  v_config jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_dealer_game uuid;
  v_before jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT p.id,p.created_at FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at,p.id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'dealer_setup_proof:requires_two_profiles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);

  FOREACH v_type IN ARRAY v_types LOOP
    v_game:=gen_random_uuid();
    v_deadline:=clock_timestamp()+interval '20 minutes';
    INSERT INTO public.games(
      id,name,status,game_type,current_host,dealer_position,config_complete,
      config_deadline,ante_decision_timer_seconds,pot,current_round,total_hands
    ) VALUES(
      v_game,'Codex rollback proof - setup '||v_type,'game_selection',NULL,
      v_users[1],1,false,v_deadline,30,CASE WHEN v_type='cribbage' THEN 0 ELSE 9 END,0,0
    );
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision,current_decision,decision_locked,auto_fold)
    VALUES
      (v_game,v_users[1],1,100,'active',true,false,NULL,'fold',true,true),
      (v_game,v_users[2],2,100,'folded',false,false,'ante_up','stay',true,true);
    SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
    SELECT id INTO v_other_player FROM public.players WHERE game_id=v_game AND position=2;

    v_config:=CASE v_type
      WHEN '3-5-7' THEN '{"ante_amount":3,"rollover_amount":1,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"reveal_at_showdown":true}'::jsonb
      WHEN 'holm-game' THEN '{"ante_amount":2,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"chucky_cards":4,"rabbit_hunt":true}'::jsonb
      WHEN 'cribbage' THEN '{"ante_amount":2,"points_to_win":121,"skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61,"game_mode":"full"}'::jsonb
      WHEN 'gin-rummy' THEN '{"ante_amount":2,"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}'::jsonb
      ELSE '{"ante_amount":2}'::jsonb
    END;

    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.games SET ante_amount=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_ante_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET points_to_win=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_scoring_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET game_setup_timer_seconds=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_timer_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET dealer_selection_state='{"isComplete":true,"winnerPosition":1}'::jsonb WHERE id=v_game;
      RAISE EXCEPTION 'direct_draw_forgery_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
      VALUES(v_game,v_users[1],v_type,v_config);
      RAISE EXCEPTION 'direct_dealer_game_insert_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_result;
    RESET ROLE;
    v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
    IF v_result->>'outcome'<>'configured' OR coalesce((v_result->>'deduped')::boolean,true)
       OR (v_result#>>'{game,status}')<>'ante_decision'
       OR (v_result#>>'{game,current_game_uuid}')::uuid<>v_dealer_game
       OR v_result#>>'{game,ante_decision_deadline}' IS NULL
       OR v_result#>>'{game,config_deadline}' IS NOT NULL
       OR (v_result#>>'{dealer_game,game_type}')<>v_type
       OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up'
       OR (SELECT sitting_out FROM public.players WHERE id=v_dealer_player)
       OR (SELECT ante_decision FROM public.players WHERE id=v_other_player) IS NOT NULL
       OR (SELECT status FROM public.players WHERE id=v_other_player)<>'active'
       OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND (current_decision IS NOT NULL OR decision_locked OR auto_fold))
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1
       OR (SELECT count(*) FROM private.dealer_game_setup_commits WHERE game_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:atomic_handoff_invalid:%:%',v_type,v_result;
    END IF;
    IF (v_type='3-5-7' AND (
          (v_result#>>'{game,rollover_amount}')::integer<>1
          OR (v_result#>>'{game,leg_value}')::integer<>2
          OR (v_result#>>'{game,reveal_at_showdown}')::boolean IS NOT TRUE
       ))
       OR (v_type='holm-game' AND (
          (v_result#>>'{game,current_round}')::integer<>1
          OR (v_result#>>'{game,chucky_cards}')::integer<>4
          OR (v_result#>>'{game,rabbit_hunt}')::boolean IS NOT TRUE
       ))
       OR (v_type='cribbage' AND (
          (v_result#>>'{game,pot}')::integer<>0
          OR (v_result#>>'{game,points_to_win}')::integer<>121
          OR (v_result#>>'{game,skunk_threshold}')::integer<>91
       ))
       OR (v_type='gin-rummy' AND (
          (v_result#>>'{game,points_to_win}')::integer<>100
          OR (v_result#>>'{dealer_game,config,gin_bonus}')::integer<>25
       ))
       OR (v_type IN ('horses','ship-captain-crew','yahtzee') AND (
          (v_result#>>'{game,leg_value}')::integer<>0
          OR (v_result#>>'{game,pot_max_enabled}')::boolean IS NOT FALSE
       )) THEN
      RAISE EXCEPTION 'dealer_setup_proof:game_specific_state_invalid:%:%',v_type,v_result;
    END IF;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_replay;
    IF v_replay->>'outcome'<>'already_configured' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
       OR (v_replay#>>'{dealer_game,id}')::uuid<>v_dealer_game
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:duplicate_changed_state:%:%',v_type,v_replay;
    END IF;
    IF v_type='yahtzee' THEN
      BEGIN
        PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,v_type,'{"ante_amount":3}'::jsonb,v_deadline);
        RAISE EXCEPTION 'dealer_setup_proof:mismatched_replay_succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='dealer_setup_proof:mismatched_replay_succeeded'
           OR SQLERRM NOT LIKE '%replay_payload_mismatch%' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;

  -- Unauthorized callers cannot create a setup commit.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - unauthorized','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider)::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:outsider_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:outsider_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:unauthorized_call_partially_mutated';
  END IF;

  -- Invalid configuration is atomic and creates no dealer-game row or claim.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'3-5-7','{"ante_amount":3,"rollover_amount":0}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:invalid_config_succeeded' OR SQLERRM NOT LIKE '%invalid_card_game_config%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game)
     OR EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_partially_mutated';
  END IF;

  -- A human session member may configure an eligible bot dealer. The bot's
  -- user identity, not the caller identity, owns the dealer-game row.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - bot dealer','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[2],1,100,'active',true),(v_game,v_users[1],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  IF (v_result#>>'{dealer_game,dealer_user_id}')::uuid<>v_users[2]
     OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up' THEN
    RAISE EXCEPTION 'dealer_setup_proof:bot_dealer_invalid:%',v_result;
  END IF;

  -- Late replay returns its stored result and cannot overwrite a newer setup.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - late replay','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET status='game_selection',dealer_position=2,
    config_complete=false,config_deadline=v_deadline+interval '1 hour',current_game_uuid=NULL
   WHERE id=v_game;
  SELECT to_jsonb(game) INTO v_before FROM public.games game WHERE id=v_game;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_replay;
  IF v_replay->>'outcome'<>'already_configured'
     OR (SELECT to_jsonb(game) FROM public.games game WHERE id=v_game) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'dealer_setup_proof:late_replay_mutated_newer_setup:%',v_replay;
  END IF;

  SELECT count(*) INTO v_count FROM private.dealer_game_setup_commits;
  IF v_count<9 THEN RAISE EXCEPTION 'dealer_setup_proof:missing_claims:%',v_count; END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'restored: rule_configuration_authority_rollback_proof.sql');

SAVEPOINT existing_games;
SELECT set_config('app.three_five_seven_test_no_sweep','on',true);
-- Caller-owned rollback proof for the authenticated ante-decision request
-- boundary. The caller must apply the candidate migration in the same
-- transaction for the pre-deployment proof, then wrap this file in
-- BEGIN/ROLLBACK for the post-deployment proof.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_357_sit uuid:=gen_random_uuid();
  v_357_start uuid:=gen_random_uuid();
  v_yahtzee_sit uuid:=gen_random_uuid();
  v_deadline_357_sit timestamptz:=clock_timestamp()+interval '20 minutes';
  v_deadline_357_start timestamptz:=clock_timestamp()+interval '21 minutes';
  v_deadline_yahtzee_sit timestamptz:=clock_timestamp()+interval '22 minutes';
  v_dealer uuid;
  v_other uuid;
  v_dealer_game uuid;
  v_result jsonb;
  v_before_rounds integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'ante_authority_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES
    (v_357_sit,'Codex rollback proof - 357 Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_sit,30,30,0,0,0,false),
    (v_357_start,'Codex rollback proof - 357 start','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_start,30,30,0,0,0,false),
    (v_yahtzee_sit,'Codex rollback proof - Yahtzee Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_yahtzee_sit,30,30,0,0,0,false);

  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_357_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_357_sit,v_users[2],2,100,'active',false,false,NULL),
    (v_357_start,v_users[1],1,100,'active',false,false,NULL),
    (v_357_start,v_users[2],2,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[2],2,100,'active',false,false,NULL);

  -- 3-5-7 final Sit Out: setup and ante submission are separate HTTP
  -- transactions. Explicitly clear every setup authority flag before the
  -- second call so this proof cannot inherit setup's trusted context.
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_357_sit,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);

  -- Authorization remains in the public wrapper and cannot partially mutate.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL
     OR coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:unauthorized_357_sit_mutated:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR v_result#>>'{phase,reason}'<>'waiting-not-enough-players'
     OR (SELECT status FROM public.games WHERE id=v_357_sit)<>'waiting'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_357_sit) IS NOT NULL
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_not_committed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_sit)<>0 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_replay_changed_state:%',v_result;
  END IF;

  -- The same protected branch must work for Yahtzee without weakening its
  -- game-authority trigger.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_yahtzee_sit,v_dealer,1,'yahtzee',jsonb_build_object('ante_amount',3),
    v_deadline_yahtzee_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_yahtzee_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR (SELECT status FROM public.games WHERE id=v_yahtzee_sit)<>'waiting'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_not_committed:%',v_result;
  END IF;

  -- Normal 3-5-7 continuation remains exactly once and replay safe.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_start AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_start AND position=2;
  SELECT public.configure_dealer_game(
    v_357_start,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_start
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT count(*) INTO v_before_rounds FROM public.rounds
   WHERE game_id=v_357_start;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_357_start)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_failed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_replay_changed_state:%',v_result;
  END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'restored: ante_decision_authority_boundary_rollback_proof.sql');

SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; req uuid:=gen_random_uuid(); g uuid; p uuid; peer uuid; dg uuid; rd uuid; r jsonb; v bigint;
 denied boolean; gen bigint; kind text; ctx text; before_count bigint;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
 WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 3) q;
 IF cardinality(users)<3 THEN RAISE EXCEPTION 'proof:three_auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 g:=(r->>'game_id')::uuid; p:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'created' OR (SELECT current_host FROM public.games WHERE id=g) IS DISTINCT FROM users[1]
 OR (SELECT count(*) FROM public.players WHERE game_id=g)<>1 OR (SELECT chips FROM public.players WHERE id=p)<>0
 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:atomic_genesis:%',r; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_created' OR (r->>'game_id')::uuid<>g THEN RAISE EXCEPTION 'proof:create_duplicate'; END IF;
 denied:=false; BEGIN PERFORM public.create_session(req,'Different payload',true,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_payload_replay'; END IF;
 SELECT count(*) INTO before_count FROM public.games;
 denied:=false; BEGIN PERFORM public.create_session(gen_random_uuid(),'Invalid seat',false,8); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR (SELECT count(*) FROM public.games)<>before_count THEN RAISE EXCEPTION 'proof:creation_failure_orphan'; END IF;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money) VALUES('Raw creation denied','waiting',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_genesis'; END IF;
 denied:=false; BEGIN UPDATE public.players SET auto_fold=true WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_gameplay'; END IF;
 denied:=false; BEGIN DELETE FROM public.players WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_delete'; END IF;
 denied:=false; BEGIN INSERT INTO public.players(game_id,user_id,chips,position) VALUES(g,users[1],0,3); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_player_genesis'; END IF;
 UPDATE public.players SET deck_color_mode='four_color' WHERE id=p;
 IF (SELECT deck_color_mode FROM public.players WHERE id=p)<>'four_color' THEN RAISE EXCEPTION 'proof:own_color'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.create_session(req,'Rollback atomic creation',false,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_actor_replay'; END IF;
 UPDATE public.players SET deck_color_mode='two_color' WHERE id=p;
 IF FOUND THEN RAISE EXCEPTION 'proof:peer_color'; END IF;
 r:=public.session_take_seat(g,4,NULL,NULL); peer:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'proof:admission'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'deleted' THEN RAISE EXCEPTION 'proof:fake_cleanup'; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_deleted' OR r->>'game_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:late_creation_resurrected'; END IF;
 EXECUTE 'RESET ROLE';

 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback automatic play '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
   VALUES(g,dg,1,1,'betting',0,jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p)) RETURNING id INTO rd;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  denied:=false; BEGIN PERFORM public.set_automatic_play(g,rd,dg,peer,0,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:peer_automatic_play:%',kind; END IF;
  r:=public.set_automatic_play(g,rd,gen_random_uuid(),p,v,true);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,true);
  IF r->>'outcome'<>'accepted' OR NOT (r->'player'->>'auto_fold')::boolean THEN RAISE EXCEPTION 'proof:enable:%:%',kind,r; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_intent'; END IF;
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:disable:%',kind; END IF;
  IF kind IN ('horses','ship-captain-crew') THEN
   IF NOT (r->>'deferred')::boolean OR NOT (r->'player'->>'auto_fold')::boolean OR (r->'player'->>'auto_play_stop_round_id')::uuid<>rd THEN RAISE EXCEPTION 'proof:deferred_request'; END IF;
   -- Duplicate old disable cannot override a newer deliberate enable.
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:queue_version'; END IF;
   EXECUTE 'RESET ROLE';
   -- No connected browser action: server turn advance alone consumes the intent.
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(peer::text)) WHERE id=rd;
   IF (SELECT auto_fold OR auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:disconnect_stop_lost'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
  ELSIF (r->'player'->>'auto_fold')::boolean OR (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:immediate_stop:%',kind;
  END IF;
  EXECUTE 'RESET ROLE';
  IF kind IN ('horses','ship-captain-crew') THEN
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(p::text)) WHERE id=rd;
   UPDATE public.games SET is_paused=true WHERE id=g;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF NOT (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:paused_stop'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   IF r->'player'->>'auto_play_stop_round_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:enable_did_not_cancel_stop'; END IF;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_stop_overrode_enable'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   EXECUTE 'RESET ROLE';
   -- A delayed old-round completion must never disable automation in a new dealer game.
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
   UPDATE public.games SET is_paused=false WHERE id=g;
   UPDATE public.games SET current_game_uuid=dg WHERE id=g;
   UPDATE public.rounds SET status='completed' WHERE id=rd;
   IF NOT (SELECT auto_fold FROM public.players WHERE id=p) OR
    (SELECT auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:cross_identity_stop'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:completed_round_toggle'; END IF;
   EXECUTE 'RESET ROLE';
  END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:money_changed'; END IF;
  IF coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak'; END IF;
 END LOOP;
 -- Preference arguments cannot bypass the mutually exclusive server intent.
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.submit_ante_decision(g,dg,p,'ante_up',true,true); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:conflicting_ante_preferences'; END IF;
 EXECUTE 'RESET ROLE';
 IF has_table_privilege('authenticated','public.players','UPDATE') OR has_table_privilege('authenticated','public.games','INSERT')
 OR has_column_privilege('authenticated','public.players','chips','UPDATE')
 OR has_column_privilege('authenticated','public.players','auto_play_stop_round_id','UPDATE')
 THEN RAISE EXCEPTION 'proof:privilege_closure'; END IF;
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'restored: final_player_authority_rollback_proof.sql');

SELECT jsonb_build_object('passed',true,'cases',(SELECT jsonb_agg(case_name ORDER BY case_name) FROM farkle_proof_log),'recovery_restored_twice',true) AS proof;
ROLLBACK;
