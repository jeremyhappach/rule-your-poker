CREATE FUNCTION pg_temp.async_bonus_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'async_bonus proof: %',label;END IF;END $$;
CREATE TEMP TABLE async_bonus_checks(label text);
CREATE FUNCTION pg_temp.async_bonus_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.match_id::text=current_setting('bonus.fail',true) THEN RAISE EXCEPTION 'bonus:injected_after_accounts';END IF;RETURN NEW;END $$;
CREATE TRIGGER bonus_failure BEFORE INSERT ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION pg_temp.async_bonus_fail();
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];game text;choice text;winner_i integer;match_i uuid;hash_i text;c private.delayed_children;
 s jsonb;attempts jsonb;totals jsonb;r jsonb;again jsonb;req uuid;delta_i integer;before_i jsonb;after_i jsonb;who integer;
BEGIN
 FOR who IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[who]);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[who];
  UPDATE public.profiles SET is_active=true WHERE id=users[who];
 END LOOP;
 FOREACH game IN ARRAY ARRAY['tri-towers','quintzee','boxdrop'] LOOP
  FOR winner_i IN 1..2 LOOP
   FOREACH choice IN ARRAY ARRAY['play','skip'] LOOP
    PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);SET LOCAL ROLE authenticated;
    match_i:=public.delayed_create(gen_random_uuid(),users[2],true,jsonb_build_array(jsonb_build_object('game',game,'stake',7)));RESET ROLE;
    SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=match_i;
    PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);SET LOCAL ROLE authenticated;
    PERFORM public.delayed_respond(match_i,gen_random_uuid(),hash_i,'accept');RESET ROLE;
    SELECT * INTO c FROM private.delayed_children WHERE match_id=match_i;
    totals:=jsonb_build_object(users[winner_i]::text,1000000,users[3-winner_i]::text,1000);
    SELECT jsonb_agg(jsonb_build_object('actor',users[i],'round',round_i,'score',CASE WHEN i=winner_i THEN 500000 ELSE 500 END,'at',1,'board','{}'::jsonb)) INTO attempts FROM generate_series(1,2) i CROSS JOIN generate_series(1,2) round_i;
    s:=jsonb_build_object('version','delayed/1','game',game,'child',c.id,'players',to_jsonb(users[1:2]),'round',2,'turn',winner_i-1,'totals',totals,'attempts',attempts,'board',NULL,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',NULL);
    UPDATE private.delayed_children SET state=s,actor=users[winner_i] WHERE id=c.id;
    UPDATE private.delayed_children SET state=jsonb_set(state,'{round}','3') WHERE id=c.id RETURNING * INTO c;
    PERFORM pg_temp.async_bonus_assert(c.state#>>'{optionalBonus,actor}'=users[winner_i]::text AND c.state#>>'{optionalBonus,choice}'='pending',game||': pending choice persisted');
    req:=gen_random_uuid();
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.delayed_bonus_choice(c.id,users[winner_i],req,c.revision,c.segment,choice);RAISE EXCEPTION 'browser reached service authority';EXCEPTION WHEN insufficient_privilege THEN NULL;END;RESET ROLE;
    SET LOCAL ROLE service_role;
    BEGIN PERFORM public.delayed_bonus_choice(c.id,users[3],req,c.revision,c.segment,choice);RAISE EXCEPTION 'outsider accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
    r:=public.delayed_load(c.id,users[winner_i]);
    PERFORM pg_temp.async_bonus_assert(r#>'{state,optionalBonus}'=c.state->'optionalBonus','reconnect reconstructs stored choice');
    RESET ROLE;
    IF choice='skip' THEN
     PERFORM set_config('bonus.fail',match_i::text,true);
     BEGIN
      SET LOCAL ROLE service_role;
      PERFORM public.delayed_bonus_choice(c.id,users[winner_i],req,c.revision,c.segment,choice);
      RAISE EXCEPTION 'injection not reached';
     EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'bonus:injected_after_accounts' THEN RAISE;END IF;END;
     RESET ROLE;
     PERFORM pg_temp.async_bonus_assert(NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=match_i) AND NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=match_i) AND NOT EXISTS(SELECT FROM private.delayed_outcomes WHERE child_id=c.id),'financial failure rolls back accounts/outcome/settlement');
     PERFORM pg_temp.async_bonus_assert((SELECT state#>>'{optionalBonus,choice}'='pending' AND revision=c.revision FROM private.delayed_children WHERE id=c.id),'financial failure rolls back decision and revision');
     PERFORM set_config('bonus.fail','',true);
    END IF;
    SET LOCAL ROLE service_role;
    r:=public.delayed_bonus_choice(c.id,users[winner_i],req,c.revision,c.segment,choice);
    again:=public.delayed_bonus_choice(c.id,users[winner_i],req,c.revision,c.segment,choice);
    RESET ROLE;
    PERFORM pg_temp.async_bonus_assert(r->'revision'=again->'revision' AND r#>'{state,attempts}'=attempts AND r#>'{state,totals}'=totals,game||': idempotent choice, unchanged scores/history');
    IF choice='play' THEN
     PERFORM pg_temp.async_bonus_assert(NOT (r->>'terminal')::boolean AND (r->>'segment')::bigint=c.segment AND (r->>'expires_at')::timestamptz=c.expires_at AND r#>>'{state,optionalBonus,choice}'='play',game||': Play retains turn/deadline');
    ELSE
     SET CONSTRAINTS ALL IMMEDIATE;
     delta_i:=CASE WHEN winner_i=1 THEN 7 ELSE -7 END;
     PERFORM pg_temp.async_bonus_assert((SELECT count(*)=1 AND min(organizer_delta)=delta_i AND min(opponent_delta)=-delta_i FROM private.delayed_settlements WHERE match_id=match_i),game||': one exact settlement');
     PERFORM pg_temp.async_bonus_assert((SELECT count(*)=2 AND sum(chips)=0 AND bool_and(chips=CASE WHEN user_id=users[1] THEN delta_i ELSE -delta_i END) FROM public.players WHERE game_id=match_i),game||': canonical balances');
     PERFORM pg_temp.async_bonus_assert((SELECT count(*)=2 AND sum(amount)=0 AND bool_and(amount=CASE WHEN profile_id=users[1] THEN delta_i ELSE -delta_i END) FROM public.player_transactions WHERE source_game_id=match_i AND transaction_type='SessionResult'),game||': real account postings');
     PERFORM pg_temp.async_bonus_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE game_id=match_i AND unmatched_deltas='{}'),game||': balanced journal');
     PERFORM pg_temp.async_bonus_assert((SELECT status='settled' FROM private.delayed_matches WHERE id=match_i) AND (SELECT reason='normal' AND winner=users[winner_i] FROM private.delayed_outcomes WHERE child_id=c.id),game||': normal completion for opponent/archive');
     SET CONSTRAINTS ALL DEFERRED;
    END IF;
    INSERT INTO async_bonus_checks VALUES(game||': player '||winner_i||' '||choice);
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
SELECT * FROM async_bonus_checks;
