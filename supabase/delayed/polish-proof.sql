-- Execute inside BEGIN/ROLLBACK after the scoped canonical proof.
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); other uuid; prefix text:='WP '||gen_random_uuid()::text||' ';
 p uuid; offer text; request uuid:=gen_random_uuid(); notice uuid; first_page jsonb; next_page jsonb; result jsonb;
 c private.delayed_children; s jsonb; pool jsonb; rack jsonb; used jsonb; items jsonb;
BEGIN
 FOR i IN 0..56 LOOP
  other:=CASE i WHEN 0 THEN a WHEN 1 THEN b ELSE gen_random_uuid() END;
  INSERT INTO auth.users(id) VALUES(other);
  INSERT INTO public.profiles(id,username,is_active) VALUES(other,prefix||lpad(i::text,2,'0'),i<>56)
   ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=EXCLUDED.is_active;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 first_page:=public.delayed_opponent_page(prefix,'username');
 next_page:=public.delayed_opponent_page(prefix,'username',first_page->'next');
 PERFORM pg_temp.aw_assert(jsonb_array_length(first_page->'items')=50 AND jsonb_array_length(next_page->'items')=5,'opponent keyset 50+5');
 PERFORM pg_temp.aw_assert((SELECT count(DISTINCT v->>'id')=55 FROM jsonb_array_elements((first_page->'items')||(next_page->'items')) v),'no duplicate opponents');
 PERFORM pg_temp.aw_assert(public.delayed_opponent_page(prefix||'01','username')->'items'->0->>'id'=b::text,'name filter');
 p:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":7}]');
 SELECT offer_hash INTO offer FROM private.delayed_matches WHERE id=p;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 result:=public.delayed_respond(p,request,offer,'accept');
 PERFORM pg_temp.aw_assert(public.delayed_respond(p,request,offer,'accept')=result,'accept replay');
 SELECT id INTO STRICT notice FROM public.platform_notifications WHERE user_id=a AND match_id=p AND kind='accepted';
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.aw_assert(EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') v WHERE v->>'id'=notice::text),'inviter acceptance notification');
 PERFORM public.delayed_notification_read(notice,1);
 PERFORM pg_temp.aw_assert(public.delayed_opponent_page(prefix,'recent')->'items'->0->>'id'=b::text,'recent accepted opponent');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') v WHERE v->>'id'=notice::text),'notification privacy');
 SELECT * INTO STRICT c FROM private.delayed_children WHERE match_id=p;
 s:=c.state; pool:=(s->'bag')||(s->'racks'->a::text)||(s->'racks'->b::text);
 SELECT jsonb_agg(tile ORDER BY ord) INTO rack FROM (SELECT (SELECT v FROM jsonb_array_elements(pool) v WHERE v->>'face'=face LIMIT 1) tile,ord FROM unnest(ARRAY['C','A','T']) WITH ORDINALITY t(face,ord)) q;
 SELECT jsonb_agg(v) INTO pool FROM jsonb_array_elements(pool) v WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(rack) r WHERE r->>'id'=v->>'id');
 SELECT rack||jsonb_agg(v ORDER BY n) INTO rack FROM jsonb_array_elements(pool) WITH ORDINALITY t(v,n) WHERE n<=4;
 SELECT jsonb_agg(v ORDER BY n) INTO used FROM jsonb_array_elements(pool) WITH ORDINALITY t(v,n) WHERE n BETWEEN 5 AND 11;
 SELECT jsonb_agg(v ORDER BY n) INTO pool FROM jsonb_array_elements(pool) WITH ORDINALITY t(v,n) WHERE n>11;
 s:=jsonb_set(jsonb_set(s,'{bag}',pool),'{racks}',jsonb_build_object(c.actor::text,rack,(CASE WHEN c.actor=a THEN b ELSE a END)::text,used));
 UPDATE private.delayed_children SET state=s WHERE id=c.id;
 SELECT jsonb_agg(jsonb_build_object('tileId',v->'id','square',111+n,'letter',v->>'face') ORDER BY n) INTO items FROM jsonb_array_elements(rack) WITH ORDINALITY t(v,n) WHERE n<=3;
 PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);request:=gen_random_uuid();
 result:=public.delayed_words_action(c.id,request,c.revision,'place',items);
 PERFORM pg_temp.aw_assert(NOT result?'error' AND public.delayed_words_action(c.id,request,c.revision,'place',items)=result,'scoring move and duplicate response');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.aw_assert(c.state->'movePresentation'->'squares'='[112,113,114]'::jsonb AND jsonb_array_length(c.state->'moves')=1,'one frozen presentation');
 PERFORM pg_temp.aw_assert(c.expires_at=c.available_at+interval '36 hours' AND c.last_call_at=c.available_at+interval '24 hours','unchanged availability clocks');
 PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.games WHERE id=p) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=p),'no interim accounting');
 PERFORM pg_temp.aw_assert(NOT has_function_privilege('anon','public.delayed_opponent_page(text,text,jsonb)','EXECUTE') AND has_function_privilege('authenticated','public.delayed_opponent_page(text,text,jsonb)','EXECUTE'),'opponent API grants');
END $$;
SELECT 'PASS opponent paging/filter/order, acceptance replay/notification/read/privacy, scored move/replay/presentation, unchanged clocks and zero interim finance' proof;
