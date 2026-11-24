-- Scoped result projections and frozen Live Words timer settings.
DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_host_changed()'::regprocedure);
BEGIN
 IF strpos(src,$new$('ptown-words/2','ptown-words/4','ptown-words/5')$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$('ptown-words/2','ptown-words/4')$old$)=0 THEN RAISE EXCEPTION 'polish:host_guard';END IF;
 EXECUTE replace(src,$old$('ptown-words/2','ptown-words/4')$old$,$new$('ptown-words/2','ptown-words/4','ptown-words/5')$new$);
END $patch$;
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS words_timer_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS words_turn_seconds integer NOT NULL DEFAULT 300;
DO $$BEGIN
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='public.game_defaults'::regclass AND conname='words_turn_seconds_range') THEN
  ALTER TABLE public.game_defaults ADD CONSTRAINT words_turn_seconds_range CHECK(words_turn_seconds BETWEEN 30 AND 3600);
 END IF;
END$$;

CREATE OR REPLACE FUNCTION private.ptown_words_live_rules(config jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE enabled boolean; seconds integer;
BEGIN
 IF config ? 'words_timer_enabled' AND jsonb_typeof(config->'words_timer_enabled') IS DISTINCT FROM 'boolean'
  OR config ? 'words_turn_seconds' AND (jsonb_typeof(config->'words_turn_seconds') IS DISTINCT FROM 'number' OR config->>'words_turn_seconds' !~ '^[0-9]+$')
 THEN RAISE EXCEPTION 'ptown_words:timer_config';END IF;
 SELECT coalesce((config->>'words_timer_enabled')::boolean,d.words_timer_enabled,true),
  coalesce((config->>'words_turn_seconds')::integer,d.words_turn_seconds,300)
 INTO enabled,seconds FROM (SELECT 1) x LEFT JOIN public.game_defaults d ON d.game_type='ptown-words';
 IF seconds NOT BETWEEN 30 AND 3600 THEN RAISE EXCEPTION 'ptown_words:timer_config';END IF;
 RETURN private.ptown_words_rules_for('ptown-words/4')||jsonb_build_object('version','ptown-words/5','timerEnabled',enabled,'turnMs',seconds*1000);
END$$;
CREATE OR REPLACE FUNCTION private.ptown_words_valid_rules(rules jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN rules->>'version'='ptown-words/5' THEN
  jsonb_typeof(rules->'timerEnabled')='boolean' AND jsonb_typeof(rules->'turnMs')='number'
  AND (rules->>'turnMs')::numeric BETWEEN 30000 AND 3600000 AND mod((rules->>'turnMs')::numeric,1000)=0
  AND rules-ARRAY['version','timerEnabled','turnMs']=private.ptown_words_rules_for('ptown-words/4')-ARRAY['version','turnMs']
 ELSE rules IS NOT NULL AND rules=private.ptown_words_rules_for(rules->>'version') END
$$;
REVOKE ALL ON FUNCTION private.ptown_words_live_rules(jsonb),private.ptown_words_valid_rules(jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE src text:=pg_get_functiondef('public.delayed_home(uuid)'::regprocedure);
BEGIN
 IF strpos(src,$new$IF c.game_type='chess' THEN scores:=NULL;
  ELSIF c.game_type='ptown-words' THEN
   FOR person IN SELECT jsonb_array_elements_text(jsonb_build_array(h->>'organizer',h->>'opponent')) LOOP
    SELECT count(*) INTO pending_count FROM private.delayed_current_review_events e
     WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND person<>who::text
      AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who);
    IF person=who::text OR c.terminal AND viewed THEN shown:=coalesce((c.state->'scores'->>person)::bigint,0);
    ELSE
     SELECT (b.board->'scores'->>person)::bigint INTO shown
      FROM private.delayed_current_review_events e
      JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who
      JOIN private.delayed_review_boards b ON b.event_id=e.id
      WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person ORDER BY e.round DESC LIMIT 1;
     shown:=coalesce(shown,0);
    END IF;
    scores:=scores||jsonb_build_object(person,shown);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
   END LOOP;
   -- The latest move itself also carries unviewed points.
   item:=item-'lastMove';$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:public.delayed_home(uuid)';END IF;
 EXECUTE replace(src,$old$IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';$old$,$new$IF c.game_type='chess' THEN scores:=NULL;
  ELSIF c.game_type='ptown-words' THEN
   FOR person IN SELECT jsonb_array_elements_text(jsonb_build_array(h->>'organizer',h->>'opponent')) LOOP
    SELECT count(*) INTO pending_count FROM private.delayed_current_review_events e
     WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND person<>who::text
      AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who);
    IF person=who::text OR c.terminal AND viewed THEN shown:=coalesce((c.state->'scores'->>person)::bigint,0);
    ELSE
     SELECT (b.board->'scores'->>person)::bigint INTO shown
      FROM private.delayed_current_review_events e
      JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who
      JOIN private.delayed_review_boards b ON b.event_id=e.id
      WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person ORDER BY e.round DESC LIMIT 1;
     shown:=coalesce(shown,0);
    END IF;
    scores:=scores||jsonb_build_object(person,shown);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
   END LOOP;
   -- The latest move itself also carries unviewed points.
   item:=item-'lastMove';$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('public.delayed_match_record(uuid,uuid)'::regprocedure);
BEGIN
 IF strpos(src,$new$jsonb_build_object('word',CASE WHEN guess_no=1 THEN guess->>'word' ELSE '' END,
                  'feedback',CASE WHEN guess_no=1 AND guess->>'word'<>r->>'answer'
                    THEN '["absent","absent","absent","absent","absent"]'::jsonb ELSE guess->'feedback' END)$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$CASE WHEN coalesce((r->>'completed')::boolean,false)
                  AND guess_no=jsonb_array_length(r->'guesses') AND guess->>'word'=r->>'answer'
                THEN guess ELSE jsonb_build_object('word','','feedback','[]'::jsonb) END$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:public.delayed_match_record(uuid,uuid)';END IF;
 EXECUTE replace(src,$old$CASE WHEN coalesce((r->>'completed')::boolean,false)
                  AND guess_no=jsonb_array_length(r->'guesses') AND guess->>'word'=r->>'answer'
                THEN guess ELSE jsonb_build_object('word','','feedback','[]'::jsonb) END$old$,$new$jsonb_build_object('word',CASE WHEN guess_no=1 THEN guess->>'word' ELSE '' END,
                  'feedback',CASE WHEN guess_no=1 AND guess->>'word'<>r->>'answer'
                    THEN '["absent","absent","absent","absent","absent"]'::jsonb ELSE guess->'feedback' END)$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure);
BEGIN
 IF strpos(src,$new$'rules',private.ptown_words_live_rules(p_config),'presentation'$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$'rules',private.ptown_words_rules(),'presentation'$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)';END IF;
 EXECUTE replace(src,$old$'rules',private.ptown_words_rules(),'presentation'$old$,$new$'rules',private.ptown_words_live_rules(p_config),'presentation'$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_deal(jsonb,bigint)'::regprocedure);
BEGIN
 IF strpos(src,$new$IF private.ptown_words_valid_rules(s->'rules') IS DISTINCT FROM true THEN$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_deal(jsonb,bigint)';END IF;
 EXECUTE replace(src,$old$IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN$old$,$new$IF private.ptown_words_valid_rules(s->'rules') IS DISTINCT FROM true THEN$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_deal(jsonb,bigint)'::regprocedure);
BEGIN
 IF strpos(src,$new$'deadline',CASE WHEN coalesce((s#>>'{rules,timerEnabled}')::boolean,true) THEN at_ms+(s#>>'{rules,turnMs}')::bigint ELSE NULL END$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$'deadline',at_ms+(s#>>'{rules,turnMs}')::bigint$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_deal(jsonb,bigint)';END IF;
 EXECUTE replace(src,$old$'deadline',at_ms+(s#>>'{rules,turnMs}')::bigint$old$,$new$'deadline',CASE WHEN coalesce((s#>>'{rules,timerEnabled}')::boolean,true) THEN at_ms+(s#>>'{rules,turnMs}')::bigint ELSE NULL END$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure);
BEGIN
 IF strpos(src,$new$IF private.ptown_words_valid_rules(s->'rules') IS DISTINCT FROM true THEN$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_reduce(jsonb,text,jsonb,bigint)';END IF;
 EXECUTE replace(src,$old$IF private.ptown_words_rules_for(s#>>'{rules,version}') IS NULL OR s->'rules' IS DISTINCT FROM private.ptown_words_rules_for(s#>>'{rules,version}') THEN$old$,$new$IF private.ptown_words_valid_rules(s->'rules') IS DISTINCT FROM true THEN$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure);
BEGIN
 IF strpos(src,$new$'deadline',CASE WHEN coalesce((s#>>'{rules,timerEnabled}')::boolean,true) THEN at_ms+(s#>>'{rules,turnMs}')::bigint ELSE NULL END$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$'deadline',at_ms+(s#>>'{rules,turnMs}')::bigint$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_reduce(jsonb,text,jsonb,bigint)';END IF;
 EXECUTE replace(src,$old$'deadline',at_ms+(s#>>'{rules,turnMs}')::bigint$old$,$new$'deadline',CASE WHEN coalesce((s#>>'{rules,timerEnabled}')::boolean,true) THEN at_ms+(s#>>'{rules,turnMs}')::bigint ELSE NULL END$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure);
BEGIN
 IF strpos(src,$new$IF action='tick' THEN IF s->>'deadline' IS NULL OR at_ms<(s->>'deadline')::bigint THEN$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$IF action='tick' THEN IF at_ms<(s->>'deadline')::bigint THEN$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_reduce(jsonb,text,jsonb,bigint)';END IF;
 EXECUTE replace(src,$old$IF action='tick' THEN IF at_ms<(s->>'deadline')::bigint THEN$old$,$new$IF action='tick' THEN IF s->>'deadline' IS NULL OR at_ms<(s->>'deadline')::bigint THEN$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure);
BEGIN
 IF strpos(src,$new$IF s#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4','ptown-words/5') OR s#>>'{rules,timerEnabled}'='false' THEN$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$IF s#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4') THEN$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_reduce(jsonb,text,jsonb,bigint)';END IF;
 EXECUTE replace(src,$old$IF s#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4') THEN$old$,$new$IF s#>>'{rules,version}' NOT IN ('ptown-words/2','ptown-words/4','ptown-words/5') OR s#>>'{rules,timerEnabled}'='false' THEN$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.ptown_words_present_move()'::regprocedure);
BEGIN
 IF strpos(src,$new$CASE WHEN coalesce((NEW.state#>>'{rules,timerEnabled}')::boolean,true) THEN to_jsonb(ready_at+(NEW.state#>>'{rules,turnMs}')::int) ELSE 'null'::jsonb END$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$to_jsonb(ready_at+(NEW.state#>>'{rules,turnMs}')::int)$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:private.ptown_words_present_move()';END IF;
 EXECUTE replace(src,$old$to_jsonb(ready_at+(NEW.state#>>'{rules,turnMs}')::int)$old$,$new$CASE WHEN coalesce((NEW.state#>>'{rules,timerEnabled}')::boolean,true) THEN to_jsonb(ready_at+(NEW.state#>>'{rules,turnMs}')::int) ELSE 'null'::jsonb END$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('public.ptown_words_action(uuid,uuid,bigint,text,jsonb)'::regprocedure);
BEGIN
 IF strpos(src,$new$('ptown-words/2','ptown-words/4','ptown-words/5')$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$('ptown-words/2','ptown-words/4')$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:public.ptown_words_action(uuid,uuid,bigint,text,jsonb)';END IF;
 EXECUTE replace(src,$old$('ptown-words/2','ptown-words/4')$old$,$new$('ptown-words/2','ptown-words/4','ptown-words/5')$new$);
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('public.ptown_words_snapshot(uuid)'::regprocedure);
BEGIN
 IF strpos(src,$new$('ptown-words/2','ptown-words/4','ptown-words/5')$new$)>0 THEN RETURN;END IF;
 IF strpos(src,$old$('ptown-words/2','ptown-words/4')$old$)=0 THEN RAISE EXCEPTION 'polish:unexpected_definition:public.ptown_words_snapshot(uuid)';END IF;
 EXECUTE replace(src,$old$('ptown-words/2','ptown-words/4')$old$,$new$('ptown-words/2','ptown-words/4','ptown-words/5')$new$);
END $patch$;


