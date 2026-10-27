-- All writes live in the runner's rollback-contained local transaction.
DO $$
DECLARE u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();g uuid; p uuid; p2 uuid;d uuid; offer timestamptz;v jsonb;s jsonb;bad jsonb;n integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(u2);
 INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Length owner',true),(u2,'Length peer',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 PERFORM pg_temp.golf_assert((SELECT golf_holes=9 FROM public.game_defaults WHERE game_type='six-card-golf'),'initial default nine');
 FOREACH n IN ARRAY ARRAY[3,6,9,18] LOOP
  UPDATE public.game_defaults SET golf_holes=n WHERE game_type='six-card-golf';
  PERFORM pg_temp.golf_assert((private.golf_admission_rules()->>'holes')::integer=n,'saved default');
  PERFORM pg_temp.golf_assert(private.golf_supported_rules(private.golf_rules_v2()||jsonb_build_object('holes',n)),'four supported durations');
 END LOOP;
 FOR bad IN SELECT value FROM jsonb_array_elements('[0,1,4,8,10,19,-3,3.5,"3",null,true,{}]'::jsonb) LOOP
  PERFORM pg_temp.golf_assert(NOT private.golf_supported_rules(private.golf_rules_v2()||jsonb_build_object('holes',bad)),'invalid rule count rejected');
 END LOOP;
 PERFORM pg_temp.golf_assert(private.golf_supported_rules(private.golf_rules()-'holes') AND private.golf_supported_rules(private.golf_rules_v2()-'holes'),'legacy omitted holes');
 BEGIN UPDATE public.game_defaults SET golf_holes=4 WHERE game_type='six-card-golf';RAISE EXCEPTION 'invalid saved default accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 FOREACH n IN ARRAY ARRAY[3,6,9,18] LOOP
  g:=gen_random_uuid();p:=gen_random_uuid();p2:=gen_random_uuid();offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,4,offer,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,4,100,false),(p2,g,u2,3,100,false);
  PERFORM pg_temp.golf_login(u);
  FOR bad IN SELECT value FROM jsonb_array_elements('[0,4,19,3.5,"3",null,true,{}]'::jsonb) LOOP
   BEGIN PERFORM public.golf_configure(g,p,4,'six-card-golf',jsonb_build_object('ante_amount',5,'holes',bad),offer);RAISE EXCEPTION 'invalid setup accepted';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:holes' THEN RAISE;END IF;END;
  END LOOP;
  UPDATE public.game_defaults SET golf_holes=6 WHERE game_type='six-card-golf';
  -- Old callers that omit holes retain nine even when the saved default differs.
  v:=public.golf_configure(g,p,4,'six-card-golf',CASE WHEN n=9 THEN '{"ante_amount":5}'::jsonb ELSE jsonb_build_object('ante_amount',5,'holes',n) END,offer);d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.golf_assert((v#>>'{dealer_game,config,rules,holes}')::integer=n,'setup selection frozen / legacy nine');
  PERFORM pg_temp.golf_assert((SELECT golf_holes=6 FROM public.game_defaults WHERE game_type='six-card-golf'),'override leaves defaults');
  UPDATE public.game_defaults SET golf_holes=18 WHERE game_type='six-card-golf';
  PERFORM pg_temp.golf_login(u2);PERFORM public.submit_ante_decision(g,d,p2,'ante_up');
  SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.golf_assert((s#>>'{rules,holes}')::integer=n AND (public.golf_snapshot(d)#>>'{rules,holes}')::integer=n,'admission and reconnect retain setup length');
  BEGIN UPDATE private.golf_matches SET state=jsonb_set(state,'{rules,holes}','6') WHERE dealer_game_id=d AND n<>6;IF n<>6 THEN RAISE EXCEPTION 'mutable duration';END IF;
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:immutable_match' THEN RAISE;END IF;END;
  UPDATE public.games SET is_paused=true WHERE id=g;
 END LOOP;
 UPDATE public.game_defaults SET golf_holes=9 WHERE game_type='six-card-golf';
END $$;

