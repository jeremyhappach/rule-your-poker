BEGIN;
DO $proof$
DECLARE u uuid; g uuid; other_g uuid; d uuid:=gen_random_uuid(); other_d uuid; p uuid; r uuid; snap uuid; denied boolean; receipt jsonb;
BEGIN
 SELECT pr.id INTO u FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 receipt:=public.create_session(gen_random_uuid(),'Rollback identity',false,1);g:=(receipt->>'game_id')::uuid;p:=(receipt->>'player_id')::uuid;
 receipt:=public.create_session(gen_random_uuid(),'Rollback other identity',false,1);other_g:=(receipt->>'game_id')::uuid;
 EXECUTE 'RESET ROLE';
 -- Pointer-before-dealer genesis remains legal within one transaction.
 UPDATE public.games SET current_game_uuid=d WHERE id=g;
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,g,u,'horses');
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(other_g,u,'horses') RETURNING id INTO other_d;
 SET CONSTRAINTS ALL IMMEDIATE;
 denied:=false; BEGIN UPDATE public.games SET current_game_uuid=other_d WHERE id=g;
 EXCEPTION WHEN foreign_key_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:cross_session_game_pointer'; END IF;
 denied:=false; BEGIN INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt) VALUES(g,other_d,1,1,'pending',0);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:cross_session_round'; END IF;
 INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt) VALUES(g,d,1,1,'pending',0) RETURNING id INTO r;
 INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,predecessor_round_id) VALUES(g,d,1,2,'pending',0,r);
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number) VALUES(g,d,p,u,'Proof',0,false,1) RETURNING id INTO snap;
 denied:=false; BEGIN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number) VALUES(g,other_d,p,u,'Proof',0,false,2);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:cross_session_snapshot'; END IF;
 denied:=false; BEGIN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number) VALUES(other_g,other_d,p,u,'Proof',0,false,1);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:cross_session_participant'; END IF;
 denied:=false; BEGIN INSERT INTO public.session_player_snapshots(game_id,player_id,user_id,username,chips,is_bot,hand_number) VALUES(g,p,u,'Proof',0,false,2);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:missing_dealer_snapshot'; END IF;
 denied:=false; BEGIN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number) VALUES(g,d,p,u,'Proof',0,false,1);
 EXCEPTION WHEN unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:duplicate_snapshot'; END IF;
 -- Preserve historical evidence if a trusted cleanup removes its participant.
 DELETE FROM public.players WHERE id=p;
 IF NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE id=snap) THEN RAISE EXCEPTION 'proof:snapshot_retention'; END IF;
 SET CONSTRAINTS ALL DEFERRED;
 DELETE FROM public.games WHERE id IN(g,other_g);
 SET CONSTRAINTS ALL IMMEDIATE;
 IF EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g) OR EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g) THEN RAISE EXCEPTION 'proof:fake_cascade'; END IF;
END $proof$;
ROLLBACK;
