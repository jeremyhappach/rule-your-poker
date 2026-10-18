DO $$
DECLARE rules jsonb:=private.royal_flash_rules();h record;b jsonb;v jsonb;s jsonb;solo jsonb;at_ms bigint:=1000;i integer;choice jsonb;req uuid;u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();g uuid:=gen_random_uuid();d uuid;r uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';other uuid:=gen_random_uuid();otherp uuid:=gen_random_uuid();before_deadline bigint;
BEGIN
 FOR h IN SELECT * FROM (VALUES
 ('[0,9,10,11,12]','royal_flush',50000),('[0,1,2,3,4]','straight_flush',40000),('[0,13,26,39,1]','four_kind',30000),
 ('[0,13,26,1,14]','full_house',20000),('[0,2,4,6,8]','flush',10000),('[0,14,28,42,4]','straight',9000),
 ('[9,23,37,51,0]','straight',9000),('[0,13,26,1,2]','three_kind',8000),('[0,13,1,14,2]','two_pair',7000),
 ('[0,13,1,2,4]','pair',5000),('[0,14,28,42,6]','high_card',0),('[null,1,2,3,4]','incomplete',0)) t(cards,kind,points) LOOP
  v:=private.royal_flash_hand(h.cards::jsonb,rules);PERFORM pg_temp.royal_assert(v->>'kind'=h.kind AND (v->>'points')::integer=h.points,'hand '||h.kind);
 END LOOP;
 b:=private.royal_flash_board_deal(jsonb_build_object('rules',rules,'score',1234),1000);
 BEGIN PERFORM private.royal_flash_board_reduce(b,'place',ARRAY[25],3500);RAISE EXCEPTION 'invalid allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'royal_flash:invalid_placement' THEN RAISE;END IF;END;
 PERFORM pg_temp.royal_assert(private.royal_flash_board_reduce(b,'tick',NULL,3499)=b,'intro unchanged before deadline');
 PERFORM pg_temp.royal_assert(private.royal_flash_board_reduce(b,'place',ARRAY[0],23500)#>>'{result,reason}'='ready_timeout','ready exact boundary');
 v:=private.royal_flash_board_reduce(b,'place',ARRAY[0],3500);
 PERFORM pg_temp.royal_assert(private.royal_flash_board_reduce(v,'take_score',NULL,3501)#>>'{result,timeBonus}'='0','partial bonus zero');
 FOR i IN 1..51 LOOP v:=private.royal_flash_board_reduce(v,'place',ARRAY[i%25],3500+i);END LOOP;
 PERFORM pg_temp.royal_assert(v->>'phase'='stage_complete' AND v->>'placements'='52' AND v#>>'{result,reason}'='exhausted','exact 52 draws');
 PERFORM pg_temp.royal_assert((v#>>'{result,timeBonus}')::integer=149*250 AND (v->>'score')::bigint=1234+(v->>'handPoints')::bigint+149*250,'whole seconds and cumulative total');
 s:=jsonb_build_object('rules',rules,'score',0,'scores',jsonb_build_object(p::text,0),'players',jsonb_build_array(jsonb_build_object('id',p,'userId',u,'isBot',true)),'turnIndex',0,'stage',1,'stages','[]'::jsonb,'identity',jsonb_build_object('dealerGameId',g,'roundId',g));
 s:=private.royal_flash_deal(s,1000);s:=private.royal_flash_reduce(s,'tick',NULL,3500);b:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 FOR i IN 0..51 LOOP
  choice:=private.royal_flash_bot_choice(private.royal_flash_visible(s)||jsonb_build_object('phase',CASE WHEN i=0 THEN 'ready' ELSE 'playing' END),3500+i);
  s:=private.royal_flash_reduce(s,choice->>'action',ARRAY[(choice->>'index')::integer],3500+i);
  b:=private.royal_flash_board_reduce(b,choice->>'action',ARRAY[(choice->>'index')::integer],3500+i);
  PERFORM pg_temp.royal_assert(s->'slots'=b->'slots' AND s->'score'=b->'score' AND s->'deadline'=b->'deadline','mode parity');
 END LOOP;
 -- Exactly one optional third round, with eligibility frozen after round two.
 s:=s||jsonb_build_object('stage',2,'turnIndex',0,'phase','stage_complete','deadline',10000,'scores',jsonb_build_object(p::text,200000));
 s:=private.royal_flash_reduce(s,'tick',NULL,10000);
 PERFORM pg_temp.royal_assert(s->>'stage'='3' AND s->>'score'='200000' AND s->'qualified'=jsonb_build_array(p::text),'earned bonus starts from cumulative score');
 s:=private.royal_flash_reduce(s,'place',ARRAY[0],12500);s:=private.royal_flash_reduce(s,'take_score',NULL,12501);s:=private.royal_flash_reduce(s,'tick',NULL,(s->>'deadline')::bigint);
 PERFORM pg_temp.royal_assert(s->>'phase'='complete' AND s->'scores'->>p::text='200000','no fourth round or double counting');
 -- Real consent/bot/recovery owners, synthetic fixture inside caller rollback.
 INSERT INTO auth.users(id) VALUES(u),(other);INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Royal human',true),(other,'Royal bot',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,2,100,false),(otherp,g,other,1,100,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 v:=public.royal_flash_configure(g,p,2,'royal-flash','{"ante_amount":7}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.royal_assert((SELECT status='ante_decision' FROM public.games WHERE id=g) AND NOT EXISTS(SELECT 1 FROM private.royal_flash_matches WHERE dealer_game_id=d),'consent precedes play');
 BEGIN UPDATE public.dealer_games SET config='{"ante_amount":1}' WHERE id=d;RAISE EXCEPTION 'mutable offer';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'megatouch:configuration_frozen' THEN RAISE;END IF;END;
 PERFORM public.advance_ante_phase(g,d);
 SELECT round_id,(state->>'deadline')::bigint INTO r,before_deadline FROM private.royal_flash_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.royal_assert(r IS NOT NULL,'bot accepts canonical stake');
 UPDATE public.games SET is_paused=true WHERE id=g;PERFORM private.royal_flash_recover();
 PERFORM pg_temp.royal_assert((SELECT (state->>'deadline')::bigint=before_deadline AND bot_due_at IS NULL FROM private.royal_flash_matches WHERE dealer_game_id=d),'pause stops bot');
 UPDATE public.games SET is_paused=false WHERE id=g;
 UPDATE private.royal_flash_matches SET state=state||jsonb_build_object('phase','ready','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+20000) WHERE dealer_game_id=d;
 PERFORM pg_sleep(.8);
 -- Rescheduling never turns a stale worker claim into a second action.
 PERFORM private.royal_flash_recover();
 PERFORM pg_temp.royal_assert((SELECT state->>'placements'='1' FROM private.royal_flash_matches WHERE dealer_game_id=d),'bot uses authoritative placement');
 PERFORM private.royal_flash_recover();PERFORM pg_temp.royal_assert((SELECT state->>'placements'='1' FROM private.royal_flash_matches WHERE dealer_game_id=d),'bot not double advanced');
END $$;
SELECT 'Royal Flash category, timing, parity, bot and consent proofs passed' AS proof;
