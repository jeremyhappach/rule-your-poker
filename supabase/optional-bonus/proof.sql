-- Disposable/rollback-contained fixtures; never update an existing customer match.
CREATE FUNCTION pg_temp.bonus_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'optional_bonus proof: %',label;END IF;END $$;
CREATE TEMP TABLE bonus_checks(label text);
CREATE FUNCTION pg_temp.bonus_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.dealer_game_id::text=current_setting('bonus.live_fail',true) THEN RAISE EXCEPTION 'bonus:injected_after_chips';END IF;RETURN NEW;END $$;
CREATE TRIGGER bonus_live_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.bonus_fail();
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;deadline timestamptz;
 game text;prefix text;winner_i integer;choice text;s jsonb;v jsonb;again jsonb;totals jsonb;stages jsonb;req uuid;revision_i bigint;parent_status text;before_i jsonb;p record;
BEGIN
 FOR winner_i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[winner_i]);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[winner_i];
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[winner_i],'Bonus proof '||users[winner_i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOREACH game IN ARRAY ARRAY['tri-towers','boxdrop','eleven-up','royal-flash'] LOOP
  prefix:=replace(game,'-','_');
  -- Local clone admission only; production release flags are never changed.
  EXECUTE format('UPDATE private.%I SET enabled=true,admission_enabled=true',prefix||'_release');
  FOR winner_i IN 1..2 LOOP
   FOREACH choice IN ARRAY ARRAY['play','skip'] LOOP
    g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
    INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',true,2,deadline,0,false,false);
    INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[i],g,users[i],3-i,100,false FROM generate_series(1,2) i;
    PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
    EXECUTE format('SELECT public.%I($1,$2,2,$3,$4,$5)',prefix||'_configure') INTO v USING g,ids[1],game,'{"ante_amount":5}'::jsonb,deadline;
    d:=(v#>>'{dealer_game,id}')::uuid;
    FOR p IN SELECT id,user_id FROM public.players WHERE game_id=g AND ante_decision IS NULL LOOP
     PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM public.submit_ante_decision(g,d,p.id,'ante_up');
    END LOOP;
    PERFORM public.advance_ante_phase(g,d);
    EXECUTE format('SELECT state FROM private.%I WHERE dealer_game_id=$1',prefix||'_matches') INTO s USING d;
    totals:=jsonb_build_object(ids[winner_i]::text,1000000,ids[3-winner_i]::text,1000);
    SELECT jsonb_agg(jsonb_build_object('playerId',ids[i],'stage',r,'score',CASE WHEN i=winner_i THEN 500000*r ELSE 500*r END,'stageScore',CASE WHEN i=winner_i THEN 500000 ELSE 500 END,'reason','take_score','id',concat(d,':',i,':',r))) INTO stages FROM generate_series(1,2) i CROSS JOIN generate_series(1,2) r;
    s:=s||jsonb_build_object('stage',2,'turnIndex',1,'phase','stage_complete','deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1,'scores',totals,'stages',stages);
    EXECUTE format('UPDATE private.%I SET state=$2 WHERE dealer_game_id=$1',prefix||'_matches') USING d,s;
    -- The existing final-main-round handoff, rather than a fabricated stage-3
    -- deal, selects the sole qualifier and enters the new decision boundary.
    EXECUTE format('SELECT private.%I($1,''tick'',NULL,$2)',prefix||'_reduce') INTO s USING s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
    EXECUTE format('UPDATE private.%I SET state=$2 WHERE dealer_game_id=$1 RETURNING state,revision',prefix||'_matches') INTO p USING d,s;
    s:=p.state;revision_i:=p.revision;
    PERFORM pg_temp.bonus_assert(s#>>'{optionalBonus,actor}'=ids[winner_i]::text AND s#>>'{optionalBonus,choice}'='pending',game||': sole winner offered');
    PERFORM pg_temp.bonus_assert(private.optional_bonus_live_actor(game,s||jsonb_build_object('scores',jsonb_build_object(ids[1]::text,1000000,ids[2]::text,1000000))) IS NULL,game||': both qualify must play');
    PERFORM pg_temp.bonus_assert(private.optional_bonus_live_actor(game,s||jsonb_build_object('scores',jsonb_build_object(ids[1]::text,0,ids[2]::text,0))) IS NULL,game||': neither qualifies');
    PERFORM pg_temp.bonus_assert(private.optional_bonus_live_actor(game,s||jsonb_build_object('stages',stages-0)) IS NULL,game||': both main games must be complete');
    PERFORM pg_temp.bonus_assert(private.optional_bonus_live_actor(game,jsonb_set(s,'{rules,version}','"future/unqualified"')) IS NULL,game||': unqualified rules fail closed');
    IF game='tri-towers' THEN
     PERFORM pg_temp.bonus_assert(private.optional_bonus_live_actor(game,s||jsonb_build_object('scores',jsonb_build_object(ids[winner_i]::text,80000,ids[3-winner_i]::text,79000))) IS NULL,'TriTowers potential draw penalties defeat skip eligibility');
    END IF;
    PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);
    BEGIN PERFORM public.competitive_bonus_choice(game,d,gen_random_uuid(),revision_i,choice);RAISE EXCEPTION 'missing outsider rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    PERFORM set_config('request.jwt.claim.sub',users[3-winner_i]::text,true);
    BEGIN PERFORM public.competitive_bonus_choice(game,d,gen_random_uuid(),revision_i,choice);RAISE EXCEPTION 'missing opponent rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    PERFORM set_config('request.jwt.claim.sub',users[winner_i]::text,true);req:=gen_random_uuid();
    IF choice='skip' THEN
     PERFORM set_config('bonus.live_fail',d::text,true);
     BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.competitive_bonus_choice(game,d,req,revision_i,choice);RAISE EXCEPTION 'injection not reached';
     EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'bonus:injected_after_chips' THEN RAISE;END IF;END;
     RESET ROLE;
     PERFORM pg_temp.bonus_assert(NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=d) AND (SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),game||': atomic rollback after financial writes');
     EXECUTE format('SELECT state,revision FROM private.%I WHERE dealer_game_id=$1',prefix||'_matches') INTO p USING d;
     PERFORM pg_temp.bonus_assert(p.state#>>'{optionalBonus,choice}'='pending' AND p.revision=revision_i,game||': decision rolled back with finances');
     PERFORM set_config('bonus.live_fail','',true);
    END IF;
    SET LOCAL ROLE authenticated;
    v:=public.competitive_bonus_choice(game,d,req,revision_i,choice);
    again:=public.competitive_bonus_choice(game,d,req,revision_i,choice);
    RESET ROLE;
    PERFORM pg_temp.bonus_assert(v#>>'{optionalBonus,choice}'=choice,game||': choice is projected to both clients');
    EXECUTE format('SELECT state,revision FROM private.%I WHERE dealer_game_id=$1',prefix||'_matches') INTO p USING d;
    PERFORM pg_temp.bonus_assert(p.state->'scores'=totals AND p.state->'stages'=stages,game||': no invented bonus score/activity');
    PERFORM pg_temp.bonus_assert(p.state#>>'{optionalBonus,choice}'=choice,game||': persisted choice/replay');
    IF choice='skip' THEN
     SET CONSTRAINTS ALL IMMEDIATE;
     PERFORM pg_temp.bonus_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),game||': exactly one result');
     PERFORM pg_temp.bonus_assert((SELECT chips=105 FROM public.players WHERE id=ids[winner_i]) AND (SELECT chips=95 FROM public.players WHERE id=ids[3-winner_i]),game||': actual canonical balances');
     PERFORM pg_temp.bonus_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d AND unmatched_deltas='{}' AND jsonb_array_length(transfers)>0),game||': balanced canonical ledger');
     PERFORM pg_temp.bonus_assert((SELECT count(*)=2 FROM public.session_player_snapshots t JOIN public.players actual_player ON actual_player.id=t.player_id AND actual_player.chips=t.chips WHERE t.dealer_game_id=d),game||': final snapshots');
     PERFORM pg_temp.bonus_assert((SELECT status='game_over' FROM public.games WHERE id=g),game||': normal terminal lifecycle');
     SET CONSTRAINTS ALL DEFERRED;
     EXECUTE format('UPDATE private.%I SET state=jsonb_set(state,''{terminal,deadline}'',''0'') WHERE dealer_game_id=$1 AND state ? ''terminal''',prefix||'_matches') USING d;
     SET LOCAL ROLE authenticated;
     EXECUTE format('SELECT public.%I($1)',prefix||'_close') USING d;
     EXECUTE format('SELECT public.%I($1)',prefix||'_close') USING d;
     PERFORM public.competitive_bonus_choice(game,d,req,revision_i,choice);
     RESET ROLE;
     PERFORM pg_temp.bonus_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),game||': close and late replay cannot repay');
    ELSE
     PERFORM pg_temp.bonus_assert(p.state->>'phase'=s->>'phase' AND p.state->'deadline'=s->'deadline',game||': Play preserves board and deadline');
     PERFORM pg_temp.bonus_assert(NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=d),game||': Play not settled');
    END IF;
    INSERT INTO bonus_checks VALUES(game||': player '||winner_i||' '||choice);
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
SELECT * FROM bonus_checks;
