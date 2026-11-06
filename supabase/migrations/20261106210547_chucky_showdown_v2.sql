DO $release_guard$ BEGIN IF EXISTS(SELECT FROM public.games WHERE real_money AND status<>'session_ended') OR EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id WHERE m.real_money AND m.status='active' AND NOT c.terminal AND c.started_at IS NOT NULL) THEN RAISE EXCEPTION 'chucky_showdown:active_money_play'; END IF; END $release_guard$;

-- Stage v2 alongside frozen v1. Admission is changed only by the guarded activation script.
ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS chucky_selection_seconds integer NOT NULL DEFAULT 30 CHECK(chucky_selection_seconds BETWEEN 5 AND 60),
  ADD COLUMN IF NOT EXISTS chucky_max_folds integer NOT NULL DEFAULT 3 CHECK(chucky_max_folds BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS chucky_max_cracks integer NOT NULL DEFAULT 3 CHECK(chucky_max_cracks BETWEEN 1 AND 7);

CREATE OR REPLACE FUNCTION private.chucky_showdown_config_v2(d public.game_defaults) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_build_object('version','chucky-showdown/2','foldMs',d.decision_timer_seconds*1000,
    'selectMs',d.chucky_selection_seconds*1000,'maxFolds',d.chucky_max_folds,'maxCracks',d.chucky_max_cracks)
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_id_v2(c jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN c->>'foldMs'='30000' AND c->>'selectMs'='30000' AND c->>'maxFolds'='3' AND c->>'maxCracks'='3'
    THEN 'chucky-showdown/2' ELSE format('chucky-showdown/2-%s-%s-%s-%s',c->>'foldMs',c->>'selectMs',c->>'maxFolds',c->>'maxCracks') END
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_defaults_v2() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb:=private.chucky_showdown_config_v2(NEW); target text:=private.chucky_showdown_id_v2(c); is_open boolean;
BEGIN
  IF NEW.decision_timer_seconds NOT BETWEEN 5 AND 60 OR NEW.decision_timer_seconds IS NULL THEN RAISE EXCEPTION 'chucky_showdown:invalid_duration'; END IF;
  SELECT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND enabled AND config->>'version'='chucky-showdown/2') INTO is_open;
  INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES(target,'chucky-showdown',c,false) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=target AND config=c AND game='chucky-showdown') THEN RAISE EXCEPTION 'arcade:rules_conflict'; END IF;
  IF is_open THEN
    UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled AND id<>target;
    UPDATE private.arcade_rulesets SET enabled=true WHERE id=target AND NOT enabled;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chucky_showdown_v2_settings ON public.game_defaults;
CREATE TRIGGER chucky_showdown_v2_settings AFTER INSERT OR UPDATE OF decision_timer_seconds,chucky_selection_seconds,chucky_max_folds,chucky_max_cracks ON public.game_defaults
FOR EACH ROW WHEN (NEW.game_type='chucky-showdown') EXECUTE FUNCTION private.chucky_showdown_defaults_v2();
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT private.chucky_showdown_id_v2(c),'chucky-showdown',c,false FROM
 (SELECT private.chucky_showdown_config_v2(d) c FROM public.game_defaults d WHERE game_type='chucky-showdown') seed ON CONFLICT(id) DO NOTHING;

-- Keep the canonical five-card tiebreak vector. Ordinals break ties between equal physical fives.
CREATE OR REPLACE FUNCTION private.chucky_showdown_best_v2(cards jsonb, OUT hand_value integer[], OUT best_cards jsonb)
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  WITH deck AS MATERIALIZED (SELECT card,idx FROM jsonb_array_elements(cards) WITH ORDINALITY AS x(card,idx)),
  combinations AS (
    SELECT jsonb_build_array(a.card,b.card,c.card,d.card,e.card) five,ARRAY[a.idx,b.idx,c.idx,d.idx,e.idx] ord
      FROM deck a JOIN deck b ON b.idx>a.idx JOIN deck c ON c.idx>b.idx JOIN deck d ON d.idx>c.idx JOIN deck e ON e.idx>d.idx
  )
  SELECT public.holm_five_card_value(five),five FROM combinations ORDER BY 1 DESC,ord LIMIT 1
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_deal_v2(s jsonb,new_round boolean,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE hand_i int:=(s->>'hand')::int+1; round_i int:=(s->>'round')::int;
 player jsonb:=public.holm_deterministic_chucky_cards((s->>'runId')::uuid,'[]',4);
BEGIN
 IF new_round THEN
   round_i:=round_i+1; hand_i:=1;
   s:=s||jsonb_build_object('risk',0,'plays','[]'::jsonb,'uses','[2,2,2,2,2,2,2]'::jsonb,
     'folds',s#>'{config,maxFolds}','cracks',s#>'{config,maxCracks}');
 END IF;
 RETURN s||jsonb_build_object('round',round_i,'hand',hand_i,'roundId',concat_ws(':',s->>'runId',round_i,hand_i),
   'player',player,'community',public.holm_deterministic_chucky_cards((s->>'runId')::uuid,player,4),'boardShown',2,
   'chucky','[]'::jsonb,'revealed',0,'best',NULL,'label',NULL,'tie',false,'level',0,'reason',NULL,'beforeRisk',s->'risk',
   'phase','deal','since',at_ms,'due',at_ms+2500);
END $$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_close_v2(s jsonb,reason text,at_ms bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT s||jsonb_build_object('phase','round_over','reason',reason,'since',at_ms,'due',at_ms+2350,
   'beforeRisk',s->'risk','risk',0,'score',(s->>'score')::int+(s->>'risk')::int,
   'status',CASE WHEN s->>'round'='3' THEN 'completed' ELSE 'active' END,
   'results',(s->'results')||jsonb_build_array(jsonb_build_object('round',s->'round','score',s->'risk','reason',reason,'plays',s->'plays')))
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_act_v2(s jsonb,action text,level_i int,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE left_i int;
BEGIN
 IF action='abandon' AND level_i IS NULL THEN RETURN s||'{"status":"abandoned"}'::jsonb; END IF;
 IF s->>'phase'='fold_stay' AND level_i IS NULL THEN
   IF action='fold' THEN
     s:=s||jsonb_build_object('folds',(s->>'folds')::int-1,'plays',(s->'plays')||'0'::jsonb);
     IF s->>'folds'='0' THEN RETURN private.chucky_showdown_close_v2(s,'folds',at_ms); END IF;
     RETURN private.chucky_showdown_deal_v2(s,false,at_ms);
   ELSIF action='stay' THEN
     RETURN s||jsonb_build_object('phase','board_reveal','since',at_ms,'due',at_ms+220);
   END IF;
 ELSIF s->>'phase'='choose' AND action='press' AND level_i BETWEEN 1 AND 7 THEN
   left_i:=(s->'uses'->>(level_i-1))::int;
   IF left_i>0 THEN
     s:=jsonb_set(s,ARRAY['uses',(level_i-1)::text],to_jsonb(left_i-1));
     RETURN s||jsonb_build_object('phase','showdown','level',level_i,'since',at_ms,'revealed',0,
       'due',at_ms+level_i*180+540,'chucky',public.holm_deterministic_chucky_cards((s->>'runId')::uuid,(s->'player')||(s->'community'),level_i));
   END IF;
 END IF;
 RAISE EXCEPTION 'arcade:illegal_action';
END $$;
-- Persist only revealed presentation frames across the next deal. A continuously connected
-- client can finish the preceding result even if one revision notification was coalesced.
CREATE OR REPLACE FUNCTION private.chucky_showdown_scene_v2(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('round',s->'round','hand',s->'hand','roundId',s->'roundId','phase',s->'phase','since',s->'since','due',s->'due',
   'player',s->'player','community',(SELECT jsonb_agg(card ORDER BY n) FROM jsonb_array_elements(s->'community') WITH ORDINALITY a(card,n) WHERE n<=(s->>'boardShown')::int),
   'chucky',(SELECT coalesce(jsonb_agg(card ORDER BY n),'[]') FROM jsonb_array_elements(s->'chucky') WITH ORDINALITY a(card,n) WHERE n<=(s->>'revealed')::int),
   'folds',s->'folds','cracks',s->'cracks','uses',s->'uses','level',s->'level','risk',s->'risk','beforeRisk',s->'beforeRisk','score',s->'score','reason',s->'reason',
   'best',CASE WHEN s->>'phase'='crack' THEN s->'best' END,'label',CASE WHEN s->>'phase'='crack' THEN s->'label' END,'tie',CASE WHEN s->>'phase'='crack' THEN s->'tie' END)
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_advance_v2(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE edge bigint; level_i int; shown int; player_value int[]; rival_value int[]; best jsonb; risk_i int;
BEGIN
 WHILE s->>'status'='active' AND (s->>'due')::bigint<=at_ms LOOP
   edge:=(s->>'due')::bigint; level_i:=(s->>'level')::int;
   CASE s->>'phase'
   WHEN 'deal' THEN s:=s||jsonb_build_object('phase','fold_stay','since',edge,'due',edge+(s#>>'{config,foldMs}')::int);
   WHEN 'fold_stay' THEN s:=private.chucky_showdown_act_v2(s,'fold',NULL,edge);
   WHEN 'board_reveal' THEN
     shown:=(s->>'boardShown')::int;
     IF shown<4 THEN s:=s||jsonb_build_object('boardShown',shown+1,'due',edge+CASE WHEN shown=2 THEN 600 ELSE 450 END);
     ELSE s:=s||jsonb_build_object('phase','choose','since',edge,'due',edge+(s#>>'{config,selectMs}')::int); END IF;
   WHEN 'choose' THEN
     SELECT min(i) INTO STRICT level_i FROM generate_series(1,7) i WHERE (s->'uses'->>(i-1))::int>0;
     s:=private.chucky_showdown_act_v2(s,'press',level_i,edge);
   WHEN 'showdown' THEN
     shown:=(s->>'revealed')::int;
     IF shown<level_i THEN
       s:=s||jsonb_build_object('revealed',shown+1,'due',edge+CASE WHEN shown+1=level_i THEN 850 ELSE 720 END);
     ELSE
       risk_i:=(s->>'risk')::int;
       player_value:=public.holm_best_hand_value((s->'player')||(s->'community'));
       SELECT hand_value,best_cards INTO STRICT rival_value,best FROM private.chucky_showdown_best_v2((s->'chucky')||(s->'community'));
       s:=s||jsonb_build_object('since',edge,'beforeRisk',risk_i);
       IF player_value>rival_value THEN
         s:=s||jsonb_build_object('phase','win','risk',risk_i+100*level_i,'due',edge+1550,'plays',(s->'plays')||to_jsonb(level_i));
       ELSE
         s:=s||jsonb_build_object('phase','crack','risk',0,'cracks',(s->>'cracks')::int-1,'due',edge+3150,
           'plays',(s->'plays')||to_jsonb(-level_i),'best',best,'label',public.holm_hand_label(rival_value),'tie',player_value=rival_value);
       END IF;
     END IF;
   WHEN 'win','crack' THEN
     s:=s||jsonb_build_object('lastShowdown',private.chucky_showdown_scene_v2(s));
     IF s->>'cracks'='0' THEN s:=private.chucky_showdown_close_v2(s,'busted',edge);
     ELSIF s->'uses'='[0,0,0,0,0,0,0]'::jsonb THEN s:=private.chucky_showdown_close_v2(s,'exhausted',edge);
     ELSE s:=private.chucky_showdown_deal_v2(s,false,edge); END IF;
   WHEN 'round_over' THEN s:=private.chucky_showdown_deal_v2(s||jsonb_build_object('lastRound',private.chucky_showdown_scene_v2(s)),true,edge);
   ELSE RAISE EXCEPTION 'arcade:invalid_state';
   END CASE;
 END LOOP;
 RETURN s;
END $$;

-- Independently replay the three round ledgers before the shared immutable result insert.
CREATE OR REPLACE FUNCTION private.chucky_showdown_valid_completion_v2(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; play int; used int[]; folds int; cracks int; points int; total int:=0; count_i int:=0; ending text;
BEGIN
 IF s->>'phase' IS DISTINCT FROM 'round_over' OR s->>'round' IS DISTINCT FROM '3' OR jsonb_array_length(s->'results') IS DISTINCT FROM 3 THEN RETURN false; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
   used:=array_fill(0,ARRAY[7]); folds:=0; cracks:=0; points:=0; ending:=NULL; count_i:=count_i+1;
   FOR play IN SELECT value::int FROM jsonb_array_elements_text(r->'plays') LOOP
     IF ending IS NOT NULL OR play IS NULL OR abs(play)>7 THEN RETURN false; END IF;
     IF play=0 THEN folds:=folds+1;
     ELSE
       used[abs(play)]:=used[abs(play)]+1;
       IF used[abs(play)]>2 THEN RETURN false; END IF;
       IF play<0 THEN cracks:=cracks+1; points:=0; ELSE points:=points+100*play; END IF;
     END IF;
     ending:=CASE WHEN cracks=(s#>>'{config,maxCracks}')::int THEN 'busted' WHEN folds=(s#>>'{config,maxFolds}')::int THEN 'folds'
       WHEN used=array_fill(2,ARRAY[7]) THEN 'exhausted' END;
   END LOOP;
   IF ending IS NULL OR r->>'reason' IS DISTINCT FROM ending OR (r->>'round')::int IS DISTINCT FROM count_i OR (r->>'score')::int IS DISTINCT FROM points THEN RETURN false; END IF;
   total:=total+points;
 END LOOP;
 RETURN (s->>'score')::int=total;
END $$;

DO $register$ DECLARE f text; anchor text:='private.chucky_showdown_valid_completion_v1(p_state)';
BEGIN
 f:=pg_get_functiondef('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)'::regprocedure);
 IF position('private.chucky_showdown_valid_completion_v2(p_state)' IN f)>0 THEN RETURN; END IF;
 IF position(anchor IN f)=0 THEN RAISE EXCEPTION 'chucky_showdown:commit_guard_changed'; END IF;
 EXECUTE replace(f,anchor,'(CASE WHEN run.config->>''version''=''chucky-showdown/2'' THEN private.chucky_showdown_valid_completion_v2(p_state) ELSE private.chucky_showdown_valid_completion_v1(p_state) END)');
END $register$;

CREATE OR REPLACE FUNCTION private.chucky_showdown_defaults_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  seconds_i integer := NEW.decision_timer_seconds;
  id_i text := CASE WHEN seconds_i=30 THEN 'chucky-showdown/1' ELSE 'chucky-showdown/1-duration-'||seconds_i END;
  open_i boolean;
  rules jsonb := jsonb_build_object('version','chucky-showdown/1','durationMs',seconds_i*1000);
BEGIN
  -- Once v2 is admitted, only the v2 defaults trigger may rotate new-run registration.
  IF EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND enabled AND config->>'version'='chucky-showdown/2') THEN RETURN NEW; END IF;
  IF seconds_i IS NULL OR seconds_i NOT BETWEEN 5 AND 60 THEN RAISE EXCEPTION 'chucky_showdown:invalid_duration'; END IF;
  SELECT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND enabled) INTO open_i;
  INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES(id_i,'chucky-showdown',rules,false) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=id_i AND config=rules AND game='chucky-showdown') THEN
    RAISE EXCEPTION 'arcade:rules_conflict';
  END IF;
  UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled AND id<>id_i;
  IF open_i THEN UPDATE private.arcade_rulesets SET enabled=true WHERE id=id_i AND NOT enabled; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_chucky_showdown_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
  p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_level integer DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; s jsonb; at_ms bigint; due bigint;
  fingerprint text; outcome text:='current'; command_id uuid; projection jsonb; v2 boolean;
BEGIN
  IF p_actor IS NULL THEN
    IF p_action IS NOT NULL OR NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN
      RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM private.require_account_enabled(p_actor);
    IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
  IF NOT FOUND OR run.game<>'chucky-showdown' OR (p_actor IS NOT NULL AND p_actor<>run.user_id) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501'; END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF p_action IS NOT NULL THEN
    IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL THEN RAISE EXCEPTION 'arcade:invalid_command'; END IF;
    fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_level)::text;
    SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
    IF FOUND THEN
      IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict'; END IF;
      outcome:='duplicate';
    END IF;
  END IF;
  v2:=run.config->>'version'='chucky-showdown/2';
  s:=run.state;
  IF run.status='active' THEN
    IF s IS NULL AND v2 THEN
      s:=private.chucky_showdown_deal_v2(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config,
        'round',0,'hand',0,'score',0,'results','[]'::jsonb),true,floor(extract(epoch FROM run.created_at)*1000)::bigint);
    ELSIF s IS NULL THEN
      s:=private.chucky_showdown_deal_v1(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config,'completedRounds',0,'bank',0,'payouts','[]'::jsonb,'score',0,'results','[]'::jsonb),
        1,true,floor(extract(epoch FROM run.created_at)*1000)::bigint);
    END IF;
    s:=CASE WHEN v2 THEN private.chucky_showdown_advance_v2(s,at_ms) ELSE private.chucky_showdown_advance_v1(s,at_ms) END;
  END IF;
  IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
    IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
    ELSE
      s:=CASE WHEN v2 THEN private.chucky_showdown_act_v2(s,p_action,p_level,at_ms) ELSE private.chucky_showdown_act_v1(s,p_action,p_level,at_ms) END;
      command_id:=p_request; outcome:='committed';
    END IF;
  END IF;

  due:=(s->>'due')::bigint;
  IF s IS DISTINCT FROM run.state THEN
    PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,due,command_id,fingerprint,p_token);
    SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
  END IF;
  -- The client can see only the prefix whose individual reveal boundary has passed.
  IF v2 THEN
    projection:=private.chucky_showdown_scene_v2(s)||jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,
      'serverAt',at_ms,'config',run.config,'lastShowdown',s->'lastShowdown','lastRound',s->'lastRound',
      'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
  ELSE
    projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,
      'serverAt',at_ms,'durationMs',run.config->'durationMs','round',s->'round','roundId',s->'roundId','hand',s->'hand',
      'phase',s->'phase','since',s->'since','due',due,'fresh',s->'fresh','level',s->'level','levels',s->'levels',
      'player',s->'player','community',s->'community','chucky',(SELECT coalesce(jsonb_agg(card ORDER BY n),'[]')
         FROM jsonb_array_elements(s->'chucky') WITH ORDINALITY AS cards(card,n) WHERE n<=(s->>'revealed')::int),
      'reason',s->'reason','beforeRisk',s->'beforeRisk','risk',s->'risk','bank',s->'bank',
      'completedRounds',s->'completedRounds','score',s->'score',
      'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
  END IF;
  RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status),'projection',projection);
END $$;


REVOKE ALL ON FUNCTION private.chucky_showdown_scene_v2(jsonb),private.chucky_showdown_config_v2(public.game_defaults),private.chucky_showdown_id_v2(jsonb),
  private.chucky_showdown_defaults_v2(),private.chucky_showdown_best_v2(jsonb),private.chucky_showdown_deal_v2(jsonb,boolean,bigint),
  private.chucky_showdown_close_v2(jsonb,text,bigint),private.chucky_showdown_act_v2(jsonb,text,integer,bigint),
  private.chucky_showdown_advance_v2(jsonb,bigint),private.chucky_showdown_valid_completion_v2(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
