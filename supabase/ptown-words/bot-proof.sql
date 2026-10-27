DO $$
DECLARE s jsonb;v jsonb;choice jsonb;after_move jsonb;before jsonb;u uuid:=gen_random_uuid();users uuid[]:=ARRAY[u,gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 ids uuid[];g uuid;d uuid;deadline timestamptz;n int;i int;req uuid;revision_i bigint;actor text;label text;at_ms bigint;started timestamptz;count_i int;
BEGIN
 UPDATE private.ptown_words_release SET enabled=true,admission_enabled=true,bots_enabled=true;
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
 FOR i IN 1..4 LOOP INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Words bot proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;END LOOP;
 -- The selector is a public-view-only policy and every candidate is revalidated.
 s:=pg_temp.words_state('[{"id":80,"face":"C","value":3},{"id":81,"face":"A","value":1},{"id":82,"face":"T","value":1},{"id":83,"face":"?","value":0}]');
 v:=private.ptown_words_visible(s,'p1');started:=clock_timestamp();choice:=private.ptown_words_bot_choice(v,2000);
 PERFORM pg_temp.words_assert(choice->>'action'='place','bot finds opening word with a blank');
 after_move:=private.ptown_words_reduce(s,choice->>'action',choice->'items',2000);
 PERFORM pg_temp.words_assert(after_move#>>'{event,points}' IS NOT NULL AND (after_move#>>'{event,points}')::int>0,'bot placement uses shared scorer');
 PERFORM pg_temp.words_assert(clock_timestamp()-started<interval '2 seconds','bounded chooser runtime');
 BEGIN PERFORM private.ptown_words_bot_choice(s,2000);RAISE EXCEPTION 'missing private input rejection';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:bot_private_input' THEN RAISE;END IF;END;
 before:=s;s:=jsonb_set(s,'{bag}','[]');s:=jsonb_set(s,'{racks,p2}','[]');
 PERFORM pg_temp.words_assert(private.ptown_words_bot_choice(private.ptown_words_visible(s,'p1'),2000)=choice,'choice does not depend on opponent rack or bag order');
 FOR n IN 2..4 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',true,4,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],5-j,100,j>1 FROM generate_series(1,n)j;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  BEGIN PERFORM public.ptown_words_configure(g,ids[1],4,'ptown-words','{"ante_amount":5}',deadline);RAISE EXCEPTION 'missing real bot rejection';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:bots_fake_money_only' THEN RAISE;END IF;END;
  UPDATE public.games SET real_money=false WHERE id=g;
  UPDATE private.ptown_words_release SET bots_enabled=false;
  BEGIN PERFORM public.ptown_words_configure(g,ids[1],4,'ptown-words','{"ante_amount":5}',deadline);RAISE EXCEPTION 'missing bot flag rejection';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:bots_fake_money_only' THEN RAISE;END IF;END;
  UPDATE private.ptown_words_release SET bots_enabled=true;
  v:=public.ptown_words_configure(g,ids[1],4,'ptown-words','{"ante_amount":5}',deadline);d:=(v#>>'{dealer_game,id}')::uuid;
  IF n>2 THEN
   BEGIN
    UPDATE public.players SET sitting_out=true,ante_decision='sit_out' WHERE id=ids[1];
    PERFORM public.advance_ante_phase(g,d);
    RAISE EXCEPTION 'missing accepted-human rejection';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:human_required' THEN RAISE;END IF;END;
  END IF;
  PERFORM public.advance_ante_phase(g,d);
  PERFORM pg_temp.words_assert((SELECT jsonb_array_length(state->'players')=n FROM private.ptown_words_matches WHERE dealer_game_id=d),'human and bots admitted with canonical consent');
  SELECT state INTO s FROM private.ptown_words_matches WHERE dealer_game_id=d;
  SELECT ordinal-1 INTO i FROM jsonb_array_elements(s->'players') WITH ORDINALITY t(p,ordinal) WHERE (p->>'isBot')::boolean LIMIT 1;
  s:=jsonb_set(s,'{turnIndex}',to_jsonb(i));UPDATE private.ptown_words_matches SET state=s WHERE dealer_game_id=d;
  UPDATE public.games SET is_paused=true WHERE id=g;
  PERFORM pg_temp.words_assert((SELECT bot_due_at IS NULL AND paused_at IS NOT NULL FROM private.ptown_words_matches WHERE dealer_game_id=d),'pause cancels bot schedule');
  before:=s;PERFORM private.ptown_words_recover(d);
  PERFORM pg_temp.words_assert((SELECT state=before FROM private.ptown_words_matches WHERE dealer_game_id=d),'no bot action while paused');
  UPDATE public.games SET is_paused=false WHERE id=g;
  PERFORM pg_sleep(0.8);
  SELECT revision INTO revision_i FROM private.ptown_words_matches WHERE dealer_game_id=d;
  PERFORM set_config('request.jwt.claim.sub','',true);PERFORM private.ptown_words_recover(d);
  PERFORM pg_temp.words_assert((SELECT revision=revision_i+1 AND state->>'turn'='2' FROM private.ptown_words_matches WHERE dealer_game_id=d),'zero-client scheduled bot move');
  PERFORM private.ptown_words_recover(d);PERFORM pg_temp.words_assert((SELECT revision=revision_i+1 FROM private.ptown_words_matches WHERE dealer_game_id=d),'no duplicate bot advance');
  -- Terminal bot pass settles canonically once, including ties with a bot.
  SELECT state INTO s FROM private.ptown_words_matches WHERE dealer_game_id=d;s:=jsonb_set(s,'{turnIndex}',to_jsonb(i));
  s:=s||jsonb_build_object('racks',(SELECT jsonb_object_agg(p->>'id','[]'::jsonb) FROM jsonb_array_elements(s->'players')p),'passes',2*n-1,'scores',(SELECT jsonb_object_agg(p->>'id',CASE WHEN (p->>'isBot')::boolean OR n=2 THEN 100 ELSE 0 END) FROM jsonb_array_elements(s->'players')p));
  UPDATE private.ptown_words_matches SET state=s WHERE dealer_game_id=d;PERFORM pg_sleep(0.8);
  UPDATE public.games SET pending_session_end=true WHERE id=g;
  PERFORM private.ptown_words_recover(d);PERFORM private.ptown_words_recover(d);
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.words_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'one bot terminal result');
  PERFORM pg_temp.words_assert((SELECT sum(chips)=n*100 FROM public.players WHERE game_id=g),'balanced actual bot settlement');
  IF n>2 THEN PERFORM pg_temp.words_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d AND unmatched_deltas='{}'),format('one balanced bot transfer batch n=%s evidence=%s',n,(SELECT jsonb_agg(jsonb_build_object('transfers',transfers,'unmatched',unmatched_deltas)) FROM public.gameplay_transfer_batches WHERE dealer_game_id=d))||' result='||(SELECT to_jsonb(gr) FROM public.game_results gr WHERE gr.dealer_game_id=d));END IF;
  PERFORM pg_temp.words_assert((SELECT count(*)=n FROM public.session_player_snapshots ss JOIN public.players p ON p.id=ss.player_id AND p.chips=ss.chips WHERE ss.dealer_game_id=d),'bot final snapshots match canonical chips');
  UPDATE private.ptown_words_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;PERFORM private.ptown_words_recover(d);
  PERFORM pg_temp.words_assert((SELECT finished FROM private.ptown_words_matches WHERE dealer_game_id=d) AND (SELECT status='session_ended' FROM public.games WHERE id=g),'zero-client bot terminal close');
  SET CONSTRAINTS ALL DEFERRED;
 END LOOP;
 PERFORM pg_temp.words_assert(NOT has_function_privilege('authenticated','private.ptown_words_bot_choice(jsonb,bigint)','EXECUTE') AND NOT has_function_privilege('authenticated','private.ptown_words_recover()','EXECUTE'),'clients cannot invoke bot authority');
END $$;
SELECT 'Ptown Words bot privacy, legal play, fake-money admission, pause, recovery and financial proofs passed' proof;
