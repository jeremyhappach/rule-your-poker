BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
DO $proof$
DECLARE admin_id uuid:=gen_random_uuid(); member_id uuid; outsider_id uuid; g uuid; fake_g uuid;
 request_id uuid:=gen_random_uuid(); reverse_id uuid:=gen_random_uuid(); original_id uuid; reversal_id uuid;
 result jsonb; replay jsonb; denied boolean; initial_balance numeric; expected_balance numeric;
 state_before jsonb; cursor_date timestamptz; cursor_id uuid; seen uuid[]:=ARRAY[]::uuid[]; row jsonb;
 total_count integer; source_entry uuid; kind text; p uuid; outcome jsonb; account_total text;
BEGIN
 SELECT profile.id INTO member_id FROM public.profiles profile JOIN auth.users u ON u.id=profile.id
 WHERE profile.is_active AND NOT public.has_role(profile.id,'admin'::public.app_role) ORDER BY profile.id LIMIT 1;
 SELECT profile.id INTO outsider_id FROM public.profiles profile JOIN auth.users u ON u.id=profile.id
 WHERE profile.id<>member_id AND NOT public.has_role(profile.id,'admin'::public.app_role) ORDER BY profile.id LIMIT 1;
 IF member_id IS NULL OR outsider_id IS NULL THEN RAISE EXCEPTION 'account_proof:profiles_required'; END IF;
 INSERT INTO public.profiles(id,username) VALUES(admin_id,'Rollback account admin');
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_id,'admin');
 SELECT coalesce(sum(amount),0) INTO initial_balance FROM public.player_transactions WHERE profile_id=member_id;
 PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.admin_record_account_entry(request_id,member_id,'Deposit','12.34','proof');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:member_can_post'; END IF;
 denied:=false; BEGIN PERFORM public.account_statement(outsider_id);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:foreign_statement'; END IF;
 denied:=false; BEGIN PERFORM public.admin_account_balances();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:member_can_list'; END IF;
 result:=public.account_statement(member_id);
 IF (result->>'balance')::numeric<>initial_balance THEN RAISE EXCEPTION 'account_proof:own_balance'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN INSERT INTO public.player_transactions(profile_id,transaction_type,amount) VALUES(member_id,'Deposit',12);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:raw_admin_insert'; END IF;
 result:=public.admin_record_account_entry(request_id,member_id,'Deposit','12.34','proof');
 original_id:=(result->>'id')::uuid;
 replay:=public.admin_record_account_entry(request_id,member_id,'Deposit','12.34','proof');
 IF replay->>'id'<>result->>'id' OR replay->>'outcome'<>'already_recorded' THEN RAISE EXCEPTION 'account_proof:deposit_replay'; END IF;
 denied:=false; BEGIN PERFORM public.admin_record_account_entry(request_id,member_id,'Deposit','99','proof');
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:request_reused'; END IF;
 denied:=false; BEGIN UPDATE public.player_transactions SET amount=99 WHERE id=original_id;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:update_allowed'; END IF;
 denied:=false; BEGIN DELETE FROM public.player_transactions WHERE id=original_id;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:delete_allowed'; END IF;
 result:=public.admin_record_account_entry(gen_random_uuid(),member_id,'Payout','2.34',NULL);
 result:=public.account_statement(member_id);
 IF (result->>'balance')::numeric<>initial_balance+10 THEN RAISE EXCEPTION 'account_proof:payout_sign'; END IF;
 result:=public.admin_reverse_account_entry(reverse_id,original_id,'Correct duplicate paperwork');
 reversal_id:=(result->>'id')::uuid;
 replay:=public.admin_reverse_account_entry(reverse_id,original_id,'Correct duplicate paperwork');
 IF replay->>'id'<>reversal_id::text THEN RAISE EXCEPTION 'account_proof:reversal_replay'; END IF;
 replay:=public.admin_reverse_account_entry(gen_random_uuid(),original_id,'Second attempt');
 IF replay->>'id'<>reversal_id::text THEN RAISE EXCEPTION 'account_proof:second_reversal'; END IF;
 replay:=public.admin_record_account_entry(request_id,member_id,'Deposit','12.34','proof');
 IF replay->>'id'<>original_id::text THEN RAISE EXCEPTION 'account_proof:late_deposit_replay'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.player_transactions WHERE reversal_of=original_id)<>1
 OR (SELECT amount FROM public.player_transactions WHERE id=original_id)<>12.34
 OR (SELECT actor_id FROM public.player_transactions WHERE id=reversal_id)<>admin_id THEN RAISE EXCEPTION 'account_proof:provenance'; END IF;
 -- More than the API row cap; same-date cursor ties must not duplicate/skip rows.
 INSERT INTO public.player_transactions(profile_id,transaction_type,amount,notes,date)
 SELECT member_id,'Deposit',0.01,'Rollback pagination',clock_timestamp() FROM generate_series(1,1205);
 SELECT coalesce(sum(amount),0),count(*) INTO expected_balance,total_count FROM public.player_transactions WHERE profile_id=member_id;
 PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
 LOOP
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.account_statement(member_id,100,cursor_date,cursor_id);
  EXECUTE 'RESET ROLE';
  IF (result->>'balance')::numeric<>expected_balance THEN RAISE EXCEPTION 'account_proof:truncated_balance'; END IF;
  FOR row IN SELECT * FROM jsonb_array_elements(result->'transactions') LOOP
   IF (row->>'id')::uuid=ANY(seen) THEN RAISE EXCEPTION 'account_proof:duplicate_page_row'; END IF;
   seen:=array_append(seen,(row->>'id')::uuid);
   IF jsonb_typeof(row->'amount')<>'string' THEN RAISE EXCEPTION 'account_proof:inexact_amount_transport'; END IF;
  END LOOP;
  EXIT WHEN NOT (result->>'has_more')::boolean;
  cursor_date:=(result#>>'{next_cursor,date}')::timestamptz; cursor_id:=(result#>>'{next_cursor,id}')::uuid;
 END LOOP;
 IF cardinality(seen)<>total_count THEN RAISE EXCEPTION 'account_proof:missing_page_row'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.admin_account_balances();
 EXECUTE 'RESET ROLE';
 SELECT value->>'balance' INTO account_total FROM jsonb_array_elements(result) WHERE value->>'id'=member_id::text;
 IF account_total::numeric<>expected_balance THEN RAISE EXCEPTION 'account_proof:admin_total'; END IF;
 -- Preserve a real-money source and its dedupe key even after a correction.
 g:=gen_random_uuid();fake_g:=gen_random_uuid();
 INSERT INTO public.games(id,name,status,real_money) VALUES(g,'Rollback real source','waiting',true),(fake_g,'Rollback fake source','waiting',false);
 INSERT INTO public.player_transactions(profile_id,transaction_type,amount,source_game_id)
 VALUES(member_id,'SessionResult',0,g) RETURNING id INTO source_entry;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.admin_reverse_account_entry(gen_random_uuid(),source_entry,'Rollback source proof');
 EXECUTE 'RESET ROLE';
 INSERT INTO public.player_transactions(profile_id,transaction_type,amount,source_game_id) VALUES(member_id,'SessionResult',99,g)
 ON CONFLICT(source_game_id,profile_id) WHERE transaction_type='SessionResult' AND source_game_id IS NOT NULL DO NOTHING;
 IF (SELECT count(*) FROM public.player_transactions WHERE source_game_id=g AND transaction_type='SessionResult')<>1 THEN
  RAISE EXCEPTION 'account_proof:source_claim_lost';
 END IF;
 denied:=false; BEGIN DELETE FROM public.games WHERE id=g; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'account_proof:real_source_deleted'; END IF;
 DELETE FROM public.games WHERE id=fake_g;
 -- Empty real sessions archive; empty fake sessions retain canonical cleanup.
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','yahtzee','cribbage','gin-rummy'] LOOP
  g:=gen_random_uuid();p:=gen_random_uuid();
  INSERT INTO public.games(id,name,status,real_money,game_type,current_host) VALUES(g,'Rollback empty archive','waiting',true,kind,member_id);
  INSERT INTO public.players(id,game_id,user_id,position,chips,waiting) VALUES(p,g,member_id,1,0,true);
  PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  denied:=false; BEGIN UPDATE public.games SET real_money=false WHERE id=g; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'account_proof:money_mode_bypass'; END IF;
  outcome:=public.session_leave(g,p,0);
  EXECUTE 'RESET ROLE';
  IF (SELECT status FROM public.games WHERE id=g)<>'session_ended' OR outcome->>'outcome'<>'archived-pristine-real-session' THEN
   RAISE EXCEPTION 'account_proof:empty_archive:%:%',kind,outcome;
  END IF;
 END LOOP;
END;
$proof$;
ROLLBACK;
