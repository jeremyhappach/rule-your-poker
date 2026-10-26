-- New admissions use /3; historical /1 and /2 reducers are untouched.
DO $patch$ DECLARE f record;s text;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('quintzee_board_reduce','quintzee_start_core','quintzee_reduce_core','quintzee_board_deal') LOOP
 s:=pg_get_functiondef(f.oid);
 IF f.proname='quintzee_board_reduce' THEN s:=replace(s,'BEGIN','BEGIN IF b#>>''{rules,version}''=''quintzee/3'' THEN RETURN private.quintzee_v3_board_reduce(b,action,items,at_ms);END IF;');
 ELSIF f.proname='quintzee_start_core' THEN s:=replace(s,'BEGIN','BEGIN IF r->>''version''=''quintzee/3'' THEN RETURN private.quintzee_v3_start(players,r,at_ms);END IF;');
 ELSIF f.proname='quintzee_reduce_core' THEN s:=replace(s,'BEGIN','BEGIN IF s#>>''{rules,version}''=''quintzee/3'' THEN RETURN private.quintzee_v3_reduce(s,action,items,at_ms);END IF;');
 ELSE s:=replace(s,'BEGIN','BEGIN IF s#>>''{rules,version}''=''quintzee/3'' THEN RETURN private.quintzee_v3_board_start((s->''rules'')-''theme'',at_ms,coalesce((s->>''score'')::bigint,0));END IF;');END IF;EXECUTE s;
 END LOOP;
 s:=pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure);EXECUTE replace(s,'private.quintzee_v2_rules()','private.quintzee_v3_rules()');
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname IN('quintzee_bot_choice','quintzee_schedule_bot')) OR (n.nspname='public' AND p.proname='quintzee_action') LOOP
 s:=pg_get_functiondef(f.oid);s:=replace(s,'=''quintzee/2''','IN(''quintzee/2'',''quintzee/3'')');
 IF s LIKE '%FUNCTION private.quintzee_bot_choice(%' THEN s:=replace(s,'BEGIN','BEGIN IF at_ms<coalesce((b#>>''{celebration,endsAt}'')::bigint,0) THEN RETURN NULL;END IF;');END IF;
 IF s LIKE '%FUNCTION private.quintzee_schedule_bot(%' THEN s:=replace(s,'OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state','OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state OR (NEW.state#>>''{rules,version}''=''quintzee/3'' AND OLD.bot_due_at IS NULL)');s:=replace(s,'RETURN NEW;','IF NEW.bot_due_at IS NOT NULL THEN NEW.bot_due_at:=greatest(NEW.bot_due_at,coalesce((NEW.state#>>''{core,board,celebration,endsAt}'')::bigint,0));END IF; RETURN NEW;');END IF;EXECUTE s;
 END LOOP;
 s:=pg_get_functiondef('private.quintzee_present_board(jsonb)'::regprocedure);s:=replace(s,'ELSIF b#>>''{rules,version}''=''quintzee/2'' THEN','ELSIF b#>>''{rules,version}''=''quintzee/3'' THEN r:=private.quintzee_v3_finish(b||''{"phase":"playing"}''::jsonb,''timeout'',(b->>''deadline'')::bigint)->''result''; ELSIF b#>>''{rules,version}''=''quintzee/2'' THEN');EXECUTE s;
 s:=pg_get_functiondef('private.quintzee_pause()'::regprocedure);s:=replace(s,'q:=jsonb_set(q,''{board}'',b);', 'IF (b#>>''{celebration,endsAt}'')::bigint>m.paused_at THEN b:=jsonb_set(b,''{celebration}'',(b->''celebration'')||jsonb_build_object(''startedAt'',(b#>>''{celebration,startedAt}'')::bigint+delta,''countAt'',(b#>>''{celebration,countAt}'')::bigint+delta,''endsAt'',(b#>>''{celebration,endsAt}'')::bigint+delta));END IF; q:=jsonb_set(q,''{board}'',b);');EXECUTE s;
END $patch$;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('quintzee/3','quintzee',private.quintzee_v3_rules(),false);
