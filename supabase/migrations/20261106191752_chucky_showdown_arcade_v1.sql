-- Chucky Showdown / 1. Admission is closed on installation.
CREATE OR REPLACE FUNCTION private.chucky_showdown_defaults_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  seconds_i integer := NEW.decision_timer_seconds;
  id_i text := CASE WHEN seconds_i=30 THEN 'chucky-showdown/1' ELSE 'chucky-showdown/1-duration-'||seconds_i END;
  open_i boolean;
  rules jsonb := jsonb_build_object('version','chucky-showdown/1','durationMs',seconds_i*1000);
BEGIN
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
REVOKE ALL ON FUNCTION private.chucky_showdown_defaults_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS chucky_showdown_duration ON public.game_defaults;
CREATE TRIGGER chucky_showdown_duration AFTER INSERT OR UPDATE OF decision_timer_seconds ON public.game_defaults
FOR EACH ROW WHEN (NEW.game_type='chucky-showdown') EXECUTE FUNCTION private.chucky_showdown_defaults_v1();

INSERT INTO public.game_defaults(game_type,decision_timer_seconds) VALUES('chucky-showdown',30) ON CONFLICT(game_type) DO NOTHING;

-- Extend only the two existing Arcade registration lists. Fail closed on drift.
DO $$
DECLARE definition text; anchor text := '''quintzee'',''run21''';
BEGIN
  definition:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
  IF position('''chucky-showdown''' IN definition)=0 THEN
    IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:start_registration_changed'; END IF;
    EXECUTE replace(definition,anchor,'''quintzee'',''run21'',''chucky-showdown''');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint
    WHERE conrelid='public.arcade_game_artwork'::regclass AND conname='arcade_game_artwork_game_check';
  IF position('''chucky-showdown''' IN definition)=0 THEN
    IF position('ARRAY[' IN definition)=0 THEN RAISE EXCEPTION 'arcade:artwork_registration_changed'; END IF;
    ALTER TABLE public.arcade_game_artwork DROP CONSTRAINT arcade_game_artwork_game_check;
    EXECUTE 'ALTER TABLE public.arcade_game_artwork ADD CONSTRAINT arcade_game_artwork_game_check '||
      replace(definition,'ARRAY[','ARRAY[''chucky-showdown''::text,');
  END IF;
END $$;
INSERT INTO public.arcade_game_artwork(game) VALUES('chucky-showdown') ON CONFLICT(game) DO NOTHING;


-- One persisted timeline. Client and worker catch up at the original boundaries.
CREATE OR REPLACE FUNCTION private.chucky_showdown_deal_v1(s jsonb, hand_i integer, fresh boolean, at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE player jsonb:=s->'player'; run_id uuid:=(s->>'runId')::uuid;
BEGIN
  IF fresh THEN
    player:=public.holm_deterministic_chucky_cards(run_id,'[]',4);
    s:=s||jsonb_build_object('levels','[]'::jsonb,'risk',0);
  END IF;
  RETURN s||jsonb_build_object('hand',hand_i,'round',1+(hand_i-1)/3,'roundId',run_id||':'||hand_i,
    'player',player,'community',public.holm_deterministic_chucky_cards(run_id,player,4),
    'chucky','[]'::jsonb,'revealed',0,'level',0,'reason',NULL,'beforeRisk',s->'risk',
    'phase','deal','since',at_ms,'fresh',fresh,'due',at_ms+CASE WHEN fresh THEN 2560 ELSE 1740 END);
END $$;

CREATE OR REPLACE FUNCTION private.chucky_showdown_pay_v1(s jsonb, reason text, at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE risk_i integer:=(s->>'risk')::integer; award integer:=CASE WHEN reason='cracked' THEN 0 ELSE risk_i END;
  hand_i integer:=(s->>'hand')::int; bank integer:=(s->>'bank')::int+award;
  payouts jsonb:=s->'payouts'||jsonb_build_array(award);
BEGIN
  s:=s||jsonb_build_object('risk',0,'beforeRisk',risk_i,'bank',bank,'payouts',payouts,
    'score',(s->>'completedRounds')::int+bank,'phase','payout','reason',reason,'since',at_ms,
    'due',at_ms+CASE WHEN hand_i%3=0 THEN 2750 WHEN reason='cracked' THEN 2050 ELSE 1450 END);
  IF hand_i%3=0 THEN
    s:=s||jsonb_build_object('results',(s->'results')||jsonb_build_array(jsonb_build_object(
      'round',s->'round','payouts',payouts,'score',bank)));
  END IF;
  IF hand_i=9 THEN s:=s||'{"status":"completed"}'::jsonb; END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.chucky_showdown_act_v1(s jsonb, action text, level_i integer, at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
  IF action='abandon' AND level_i IS NULL THEN RETURN s||'{"status":"abandoned"}'::jsonb; END IF;
  IF s->>'phase'='decision' THEN
    IF action='bank' AND level_i IS NULL THEN RETURN private.chucky_showdown_pay_v1(s,'bank',at_ms); END IF;
    IF action='press' AND level_i BETWEEN 1 AND 7 AND NOT s->'levels' @> jsonb_build_array(level_i) THEN
      RETURN s||jsonb_build_object('phase','showdown','level',level_i,'since',at_ms,'revealed',0,
        'due',at_ms+level_i*180+540,'chucky',public.holm_deterministic_chucky_cards(
          (s->>'runId')::uuid,(s->'player')||(s->'community'),level_i));
    END IF;
  END IF;
  RAISE EXCEPTION 'arcade:illegal_action';
END $$;

CREATE OR REPLACE FUNCTION private.chucky_showdown_advance_v1(s jsonb, at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE edge bigint; level_i integer; shown integer; risk_i integer; hand_i integer;
BEGIN
  WHILE s->>'status'='active' AND (s->>'due')::bigint<=at_ms LOOP
    edge:=(s->>'due')::bigint;
    CASE s->>'phase'
    WHEN 'deal' THEN
      s:=s||jsonb_build_object('phase','decision','since',edge,'due',edge+(s#>>'{config,durationMs}')::integer);
    WHEN 'decision' THEN
      s:=private.chucky_showdown_pay_v1(s,'timeout',edge);
    WHEN 'showdown' THEN
      level_i:=(s->>'level')::integer;
      shown:=(s->>'revealed')::integer;
      IF shown<level_i THEN
        s:=s||jsonb_build_object('revealed',shown+1,'due',edge+CASE WHEN shown+1=level_i THEN 650 ELSE 360 END);
      ELSIF public.holm_best_hand_value((s->'player')||(s->'community')) >
            public.holm_best_hand_value((s->'chucky')||(s->'community')) THEN
        risk_i:=(s->>'risk')::integer;
        s:=s||jsonb_build_object('levels',(s->'levels')||jsonb_build_array(level_i),'risk',risk_i+100*level_i,
          'beforeRisk',risk_i,'phase','win','since',edge,'due',edge+1350);
      ELSE
        s:=private.chucky_showdown_pay_v1(s,'cracked',edge);
      END IF;
    WHEN 'win' THEN
      IF jsonb_array_length(s->'levels')=7 THEN s:=private.chucky_showdown_pay_v1(s,'all',edge);
      ELSE s:=private.chucky_showdown_deal_v1(s,(s->>'hand')::integer,false,edge); END IF;
    WHEN 'payout' THEN
      hand_i:=(s->>'hand')::integer;
      IF hand_i%3=0 THEN s:=s||jsonb_build_object('completedRounds',s->'score','bank',0,'payouts','[]'::jsonb); END IF;
      s:=private.chucky_showdown_deal_v1(s,hand_i+1,true,edge);
    ELSE RAISE EXCEPTION 'arcade:invalid_state';
    END CASE;
  END LOOP;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.chucky_showdown_valid_completion_v1(s jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; round_i integer:=0; total integer:=0; subtotal integer; valid boolean;
BEGIN
  IF s->>'hand' IS DISTINCT FROM '9' OR s->>'phase' IS DISTINCT FROM 'payout' OR
     jsonb_array_length(s->'results') IS DISTINCT FROM 3 THEN RETURN false; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
    round_i:=round_i+1;
    SELECT sum(n::int),bool_and(n::int BETWEEN 0 AND 2800 AND n::int%100=0)
      INTO subtotal,valid FROM jsonb_array_elements_text(r->'payouts') n;
    IF r->>'round' IS DISTINCT FROM round_i::text OR jsonb_array_length(r->'payouts') IS DISTINCT FROM 3
      OR valid IS DISTINCT FROM true OR (r->>'score')::int IS DISTINCT FROM subtotal THEN RETURN false; END IF;
    total:=total+subtotal;
  END LOOP;
  RETURN (s->>'score')::int=total;
END $$;
DO $$
DECLARE definition text; anchor text:=' IF run.game=''quintzee'' AND status_i=''completed''';
BEGIN
  definition:=pg_get_functiondef('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)'::regprocedure);
  IF position('private.chucky_showdown_valid_completion_v1' IN definition)=0 THEN
    IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:commit_registration_changed'; END IF;
    EXECUTE replace(definition,anchor,' IF run.game=''chucky-showdown'' AND status_i=''completed'' AND private.chucky_showdown_valid_completion_v1(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION ''arcade:invalid_completion''; END IF;'||chr(10)||anchor);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_chucky_showdown_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
  p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_level integer DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; s jsonb; at_ms bigint; due bigint;
  fingerprint text; outcome text:='current'; command_id uuid; projection jsonb;
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
  s:=run.state;
  IF run.status='active' THEN
    IF s IS NULL THEN
      s:=private.chucky_showdown_deal_v1(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config,'completedRounds',0,'bank',0,'payouts','[]'::jsonb,'score',0,'results','[]'::jsonb),
        1,true,floor(extract(epoch FROM run.created_at)*1000)::bigint);
    END IF;
    s:=private.chucky_showdown_advance_v1(s,at_ms);
  END IF;
  IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
    IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
    ELSE
      s:=private.chucky_showdown_act_v1(s,p_action,p_level,at_ms);
      command_id:=p_request; outcome:='committed';
    END IF;
  END IF;

  due:=(s->>'due')::bigint;
  IF s IS DISTINCT FROM run.state THEN
    PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,due,command_id,fingerprint,p_token);
    SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
  END IF;
  -- The client can see only the prefix whose individual reveal boundary has passed.
  projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,
    'serverAt',at_ms,'durationMs',run.config->'durationMs','round',s->'round','roundId',s->'roundId','hand',s->'hand',
    'phase',s->'phase','since',s->'since','due',due,'fresh',s->'fresh','level',s->'level','levels',s->'levels',
    'player',s->'player','community',s->'community','chucky',(SELECT coalesce(jsonb_agg(card ORDER BY n),'[]')
       FROM jsonb_array_elements(s->'chucky') WITH ORDINALITY AS cards(card,n) WHERE n<=(s->>'revealed')::int),
    'reason',s->'reason','beforeRisk',s->'beforeRisk','risk',s->'risk','bank',s->'bank',
    'completedRounds',s->'completedRounds','score',s->'score',
    'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
  RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status),'projection',projection);
END $$;

-- Service supplies the authenticated actor. Only that actor's completed runs are returned.
CREATE OR REPLACE FUNCTION public.arcade_chucky_showdown_history(p_actor uuid,p_before uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cursor_at timestamptz; rows_i jsonb;
BEGIN
  PERFORM private.require_account_enabled(p_actor);
  IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501'; END IF;
  IF p_before IS NOT NULL THEN
    SELECT completed_at INTO STRICT cursor_at FROM private.arcade_results
      WHERE run_id=p_before AND user_id=p_actor AND game='chucky-showdown';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('runId',run_id,'completedAt',completed_at,'score',score,
      'ruleset',ruleset) ORDER BY completed_at DESC,run_id DESC),'[]') INTO rows_i
    FROM (SELECT run_id,completed_at,score,ruleset FROM private.arcade_results WHERE user_id=p_actor AND game='chucky-showdown'
        AND (p_before IS NULL OR (completed_at,run_id)<(cursor_at,p_before)) ORDER BY completed_at DESC,run_id DESC LIMIT 20) page;
  RETURN rows_i;
END $$;

REVOKE ALL ON FUNCTION private.chucky_showdown_deal_v1(jsonb,integer,boolean,bigint),
  private.chucky_showdown_act_v1(jsonb,text,integer,bigint),private.chucky_showdown_pay_v1(jsonb,text,bigint),
  private.chucky_showdown_advance_v1(jsonb,bigint), private.chucky_showdown_valid_completion_v1(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid),
  public.arcade_chucky_showdown_history(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid),
  public.arcade_chucky_showdown_history(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
