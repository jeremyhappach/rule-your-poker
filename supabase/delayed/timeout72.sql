-- Async orchestration owns availability; frozen playable clocks and game rules stay intact.
ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_check;
ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_check CHECK (
 (available_at IS NULL AND last_call_at IS NULL AND expires_at IS NULL) OR
 (available_at IS NOT NULL AND last_call_at IS NOT NULL AND expires_at IS NOT NULL AND
 ((last_call_at=available_at+interval '24 hours' AND expires_at=available_at+interval '36 hours') OR
  (last_call_at=available_at+interval '48 hours' AND expires_at=available_at+interval '72 hours'))));

CREATE FUNCTION private.delayed_turn_window() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT NEW.terminal AND NEW.available_at IS NOT NULL THEN
  NEW.last_call_at:=NEW.available_at+interval '48 hours';
  NEW.expires_at:=NEW.available_at+interval '72 hours';
  IF NEW.game_type='chess' AND NEW.gameplay_due_at IS NULL AND NEW.state->>'opened'='false' THEN
   NEW.state:=NEW.state||jsonb_build_object('deadline',floor(extract(epoch FROM NEW.expires_at)*1000)::bigint,'clockDuration',259200000);
  ELSIF NEW.game_type='ptown-words' AND NEW.config->>'version'='ptown-words/3' THEN
   NEW.state:=jsonb_set(NEW.state,'{deadline}',to_jsonb(floor(extract(epoch FROM NEW.expires_at)*1000)::bigint));
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.delayed_turn_window() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delayed_00_turn_window BEFORE INSERT OR UPDATE ON private.delayed_children
 FOR EACH ROW EXECUTE FUNCTION private.delayed_turn_window();

CREATE FUNCTION private.delayed_quintzee_missed_turn(c private.delayed_children,m private.delayed_matches) RETURNS void
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s jsonb:=c.state;b jsonb;ids jsonb;at_ms bigint:=floor(extract(epoch FROM c.expires_at)*1000);turn_i int;round_i int;done boolean:=false;winner uuid;who text;total bigint;
BEGIN
 IF c.gameplay_due_at IS NOT NULL THEN RAISE EXCEPTION 'delayed:entered_round';END IF;
 IF s IS NULL THEN
  ids:=jsonb_build_array(c.starter,CASE WHEN c.starter=m.organizer THEN m.opponent ELSE m.organizer END);
  s:=jsonb_build_object('version','delayed/1','game','quintzee','child',c.id,'players',ids,'round',1,'turn',0,
   'totals',jsonb_build_object(m.organizer::text,0,m.opponent::text,0),'attempts','[]'::jsonb,'board',NULL,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',NULL);
 END IF;
 IF s->'players'->>((s->>'turn')::int) IS DISTINCT FROM c.actor::text OR nullif(s->'board','null') IS NOT NULL THEN RAISE EXCEPTION 'delayed:missed_turn_identity';END IF;
 -- The unchanged rule core produces the empty round and its zero-score result.
 b:=public.delayed_board_core('quintzee','deal',c.config,(s->'totals'->>c.actor::text)::bigint,NULL,NULL,NULL,at_ms-(c.config->>'durationMs')::bigint-(c.config->>'introMs')::bigint);
 b:=public.delayed_board_core('quintzee','reduce',c.config,0,b,'tick',ARRAY[]::int[],(b->>'deadline')::bigint);
 IF b->>'phase'<>'stage_complete' OR (b->>'score')::bigint<>(s->'totals'->>c.actor::text)::bigint THEN RAISE EXCEPTION 'delayed:empty_round_score';END IF;
 s:=s||jsonb_build_object('attempts',(s->'attempts')||jsonb_build_array(jsonb_build_object('actor',c.actor,'round',(s->>'round')::int,'score',0,'at',at_ms,'board',b,'availabilityExpired',true)), 'board',NULL,'deck',NULL,'segmentStartedAt',NULL);
 turn_i:=(s->>'turn')::int+1;round_i:=(s->>'round')::int;
 IF turn_i=2 THEN turn_i:=0;round_i:=round_i+1;END IF;
 WHILE round_i>(c.config->>'rounds')::int LOOP
  IF round_i>(c.config->>'maxRounds')::int THEN done:=true;EXIT;END IF;
  who:=s->'players'->>turn_i;total:=(s->'totals'->>who)::bigint;
  EXIT WHEN round_i<=(public.delayed_board_core('quintzee','rounds',p_score=>total))::int;
  turn_i:=turn_i+1;IF turn_i=2 THEN turn_i:=0;round_i:=round_i+1;END IF;
 END LOOP;
 IF done THEN
  IF (s->'totals'->>(s->'players'->>0))::bigint<>(s->'totals'->>(s->'players'->>1))::bigint THEN
   winner:=CASE WHEN (s->'totals'->>(s->'players'->>0))::bigint>(s->'totals'->>(s->'players'->>1))::bigint THEN (s->'players'->>0)::uuid ELSE (s->'players'->>1)::uuid END;
  END IF;
 END IF;
 s:=s||jsonb_build_object('turn',turn_i,'round',round_i,'completed',done,'winner',winner);
 UPDATE private.delayed_children SET state=s,actor=(s->'players'->>turn_i)::uuid,revision=revision+1,segment=segment+1,
  available_at=clock_timestamp(),started_at=NULL,gameplay_due_at=NULL WHERE id=c.id RETURNING * INTO c;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 IF done THEN PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,jsonb_build_object('rules',c.config,'finalState',s));
 ELSE PERFORM private.delayed_notify(m.id);END IF;
END $$;
REVOKE ALL ON FUNCTION private.delayed_quintzee_missed_turn(private.delayed_children,private.delayed_matches) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$ DECLARE src text;needle text;replacement text;BEGIN
 src:=pg_get_functiondef('private.delayed_expire(uuid,bigint,timestamptz)'::regprocedure);
 needle:=$old$ PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',$old$;
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'timeout72:expiry_preimage';END IF;
 replacement:=$new$ IF c.game_type='ptown-words' THEN
  IF c.config->>'version'='ptown-words/3' THEN
   PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'pass',NULL,(c.state->>'deadline')::bigint-1),clock_timestamp());
  ELSE
   PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'tick',NULL,greatest((c.state->>'deadline')::bigint,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)),clock_timestamp());
  END IF;
  RETURN true;
 ELSIF c.game_type='quintzee' THEN
  IF c.gameplay_due_at IS NOT NULL THEN RETURN false;END IF;
  PERFORM private.delayed_quintzee_missed_turn(c,m);RETURN true;
 END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',$new$;
 EXECUTE replace(src,needle,replacement);
 src:=pg_get_functiondef('public.delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb)'::regprocedure);
 IF strpos(src,'expected_due:=least(c.expires_at,c.gameplay_due_at);')=0 THEN RAISE EXCEPTION 'timeout72:commit_preimage';END IF;
 src:=replace(src,'expected_due:=least(c.expires_at,c.gameplay_due_at);','expected_due:=CASE WHEN c.game_type=''quintzee'' THEN coalesce(c.gameplay_due_at,c.expires_at) ELSE least(c.expires_at,c.gameplay_due_at) END;');
 src:=replace(src,'IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN','IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) AND NOT(c.game_type=''quintzee'' AND c.gameplay_due_at IS NOT NULL) THEN');
 EXECUTE src;
 -- Keep the existing exact-snapshot Chess correction compatible with the new window.
 src:=pg_get_functiondef('public.admin_correct_chess_timeout(uuid,uuid,bigint,text,text)'::regprocedure);
 IF strpos(src,'at_ms+129600000')=0 THEN RAISE EXCEPTION 'timeout72:chess_correction_preimage';END IF;
 src:=replace(replace(replace(replace(src,'at_ms+129600000','at_ms+259200000'),'''clockDuration'',300000','''clockDuration'',259200000'),'interval ''24 hours''','interval ''48 hours'''),'interval ''36 hours''','interval ''72 hours''');
 EXECUTE src;
END $patch$;

-- Extend active availability from its existing start; completed history is untouched.
WITH extended AS (
 UPDATE private.delayed_children c SET last_call_at=c.available_at+interval '48 hours',expires_at=c.available_at+interval '72 hours',revision=c.revision+1
 FROM private.delayed_matches m WHERE m.id=c.match_id AND m.status='active' AND NOT c.terminal AND c.available_at IS NOT NULL RETURNING c.match_id
)
UPDATE private.delayed_matches SET revision=revision+1 WHERE id IN(SELECT match_id FROM extended);
