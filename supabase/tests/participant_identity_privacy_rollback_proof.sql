-- Synthetic sessions only; existing profiles are read, never modified.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
DO $proof$
DECLARE
 users uuid[]; g uuid:=gen_random_uuid(); other_game uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid(); peer_p uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 bot uuid:=gen_random_uuid(); second_bot uuid:=gen_random_uuid(); forged uuid:=gen_random_uuid();
 r jsonb; denied boolean; field_name text; actor uuid; actor_role text;
 before_seq integer; bot_player uuid;
BEGIN
 SELECT array_agg(id ORDER BY id) INTO users FROM (
   SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE NOT public.has_role(p.id,'admin'::public.app_role) AND p.is_active ORDER BY p.id LIMIT 3
 ) eligible;
 IF coalesce(cardinality(users),0)<>3 THEN RAISE EXCEPTION 'identity_proof:requires_profiles'; END IF;
 INSERT INTO public.profiles(id,username,email) VALUES(a,'Identity proof admin','identity-proof@example.invalid');
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin'::public.app_role);
 INSERT INTO public.games(id,name,current_host,status,game_type,real_money)
 VALUES(g,'Rollback identity proof',users[1],'waiting','holm-game',false),
 (other_game,'Rollback identity proof other',users[1],'waiting','holm-game',false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status)
 VALUES(p,g,users[1],1,10,false,'active'),(peer_p,g,users[2],2,20,false,'active');

 IF has_column_privilege('anon','public.profiles','email','SELECT')
    OR has_column_privilege('authenticated','public.profiles','email','SELECT')
    OR has_function_privilege('anon','public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.allocate_bot_alias_number(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'identity_proof:alternate_capability';
 END IF;
 FOR actor,actor_role IN SELECT NULL::uuid,'anon'::text UNION ALL SELECT users[1],'authenticated'
   UNION ALL SELECT users[2],'authenticated' UNION ALL SELECT users[3],'authenticated'
 LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',actor_role)::text,true);
   PERFORM set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
   EXECUTE format('SET LOCAL ROLE %I',actor_role);
   FOREACH field_name IN ARRAY ARRAY['id','game_id','user_id','is_bot'] LOOP
     denied:=false;
     BEGIN
       IF field_name='is_bot' THEN UPDATE public.players SET is_bot=true WHERE id=p;
       ELSE EXECUTE format('UPDATE public.players SET %I=$1 WHERE id=$2',field_name) USING forged,p;
       END IF;
     EXCEPTION WHEN insufficient_privilege THEN denied:=true;
     END;
     IF NOT denied THEN RAISE EXCEPTION 'identity_proof:identity_changed:%:%',actor_role,field_name; END IF;
   END LOOP;
   denied:=false;
   BEGIN
     INSERT INTO public.profiles(id,username) VALUES(forged,'Bot fabricated identity');
   EXCEPTION WHEN insufficient_privilege THEN denied:=true;
   END;
   IF NOT denied THEN RAISE EXCEPTION 'identity_proof:foreign_profile_created'; END IF;
   denied:=false;
   BEGIN
     INSERT INTO public.players(game_id,user_id,position,is_bot) VALUES(g,users[3],3,true);
   EXCEPTION WHEN insufficient_privilege THEN denied:=true;
   END;
   IF NOT denied THEN RAISE EXCEPTION 'identity_proof:direct_bot_created'; END IF;
   denied:=false;
   BEGIN
     PERFORM email FROM public.profiles WHERE id=users[1];
   EXCEPTION WHEN insufficient_privilege THEN denied:=true;
   END;
   IF NOT denied THEN RAISE EXCEPTION 'identity_proof:email_exposed'; END IF;
   IF actor IS DISTINCT FROM users[1] THEN
     denied:=false;
     BEGIN PERFORM public.create_session_bot(g,bot,'normal',4);
     EXCEPTION WHEN insufficient_privilege THEN denied:=true;
     END;
     IF NOT denied THEN RAISE EXCEPTION 'identity_proof:unauthorized_bot_created'; END IF;
   END IF;
   IF actor_role='authenticated' THEN
     denied:=false;
     BEGIN PERFORM * FROM public.admin_get_profiles();
     EXCEPTION WHEN insufficient_privilege THEN denied:=true;
     END;
     IF NOT denied THEN RAISE EXCEPTION 'identity_proof:admin_profiles_exposed'; END IF;
   END IF;
   PERFORM id,username,table_layout,card_back_design,deck_color_mode FROM public.profiles WHERE id=users[1];
   EXECUTE 'RESET ROLE';
 END LOOP;

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[3],'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO public.players(game_id,user_id,position,is_bot,chips) VALUES(g,users[3],3,false,0);
 UPDATE public.players SET mobile_view=true WHERE game_id=g AND user_id=users[3];
 IF NOT FOUND THEN RAISE EXCEPTION 'identity_proof:ordinary_player_control_blocked'; END IF;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session_bot(g,bot,'normal',4,false,true,users[2]);
 bot_player:=(r->'player'->>'id')::uuid;
 IF r->>'deduped'<>'false' OR (r->'player'->>'chips')::integer<>0 THEN RAISE EXCEPTION 'identity_proof:bot_creation_invalid'; END IF;
 before_seq:=(SELECT bot_alias_seq FROM public.games WHERE id=g);
 r:=public.create_session_bot(g,bot,'aggressive',5,false,false,users[2]);
 IF r->>'deduped'<>'true' OR (r->'player'->>'id')::uuid<>bot_player
    OR (SELECT bot_alias_seq FROM public.games WHERE id=g)<>before_seq THEN
   RAISE EXCEPTION 'identity_proof:bot_replay_changed_state';
 END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.session_events WHERE game_id=g AND event_type='bot_added')<>1
    OR NOT EXISTS(SELECT 1 FROM public.session_events WHERE game_id=g AND event_type='bot_added' AND user_id=users[1]
       AND event_data->>'bot_id'=bot::text) THEN
   RAISE EXCEPTION 'identity_proof:bot_provenance_invalid';
 END IF;
 DELETE FROM public.players WHERE id=bot_player;
 UPDATE public.games SET status='in_progress' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session_bot(g,second_bot,'normal',4,false,false);
 IF (r->>'ordinal')::integer<>before_seq+1 OR (r->'player'->>'waiting')::boolean IS NOT TRUE
    OR (r->'player'->>'sitting_out')::boolean IS NOT TRUE THEN
   RAISE EXCEPTION 'identity_proof:active_bot_or_alias_invalid';
 END IF;
 EXECUTE 'RESET ROLE';

 UPDATE public.games SET real_money=true WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN PERFORM public.create_session_bot(g,gen_random_uuid(),'normal',5);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'identity_proof:real_money_bot_created'; END IF;
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET real_money=false,status='session_ended' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN PERFORM public.create_session_bot(g,gen_random_uuid(),'normal',5);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'create_session_bot:terminal_game' THEN RAISE; END IF; denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'identity_proof:terminal_bot_created'; END IF;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.admin_get_profiles() WHERE id=a AND email='identity-proof@example.invalid') THEN
   RAISE EXCEPTION 'identity_proof:admin_contact_read_blocked';
 END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>30 THEN RAISE EXCEPTION 'identity_proof:balances_changed'; END IF;
END;
$proof$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
