-- Closed candidate; never activate without the full Arcade and financial gates.
CREATE TABLE private.five_alive_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 async_enabled boolean NOT NULL DEFAULT false,async_real_qualified boolean NOT NULL DEFAULT false);
INSERT INTO private.five_alive_release DEFAULT VALUES;
ALTER TABLE private.five_alive_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.five_alive_release FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE actual text;expected text:=$check$CHECK ((game_type = ANY (ARRAY['chess'::text, 'ptown-words'::text, 'run21'::text, 'tri-towers'::text, 'quintzee'::text, 'boxdrop'::text, 'mega-card-golf'::text, 'take-two'::text, 'crib-lab'::text, 'chucky-showdown'::text])))$check$;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='private.delayed_children'::regclass AND conname='delayed_children_game_type_check';
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'five_alive:game_constraint_preimage_changed';END IF;
 ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check;
 ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check
  CHECK(game_type IN('chess','ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown','five-alive'));
END $$;

-- Extend the established create, acceptance and capability owners only.
DO $$
DECLARE src text;old_i text;new_i text;
BEGIN
 src:=pg_get_functiondef('public.delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure);
 old_i:=$old$coalesce(item->>'game','') NOT IN($old$;
 new_i:=$new$coalesce(item->>'game','') NOT IN('five-alive',$new$;
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:create_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 old_i:=$old$  WHEN 'take-two' THEN$old$;
 new_i:=$new$  WHEN 'five-alive' THEN
   IF NOT EXISTS(SELECT FROM private.five_alive_release WHERE singleton AND async_enabled AND (NOT p_real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   SELECT config INTO STRICT cfg FROM private.arcade_rulesets WHERE id='five-alive/1' AND game='five-alive';
  WHEN 'take-two' THEN$new$;
 IF strpos(src,$needle$WHEN 'five-alive' THEN$needle$)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:create_rules_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 EXECUTE src;

 src:=pg_get_functiondef('public.delayed_respond(uuid,uuid,text,text)'::regprocedure);
 old_i:=$old$IF c.game_type NOT IN($old$;new_i:=$new$IF c.game_type NOT IN('five-alive',$new$;
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:accept_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 old_i:='   dealt:=NULL;';
 new_i:=$new$   dealt:=NULL;
   IF c.game_type='five-alive' THEN
    IF NOT EXISTS(SELECT FROM private.five_alive_release WHERE singleton AND async_enabled AND (NOT m.real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
    dealt:=private.five_alive_async_deal(c.id,m.organizer,m.opponent,c.config->>'poolVersion');
   END IF;$new$;
 IF strpos(src,$needle$dealt:=private.five_alive_async_deal$needle$)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:deal_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 EXECUTE src;

 -- Chess wraps the prior capability owner; extend that owner and retain its wrapper.
 src:=pg_get_functiondef('private.chess_prior_delayed_capabilities()'::regprocedure);
 old_i:=$old$||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release$old$;
 new_i:=$new$||CASE WHEN (SELECT async_enabled FROM private.five_alive_release WHERE singleton)
 THEN jsonb_build_array(jsonb_build_object('id','five-alive','stake',coalesce((SELECT ante_amount FROM public.game_defaults WHERE game_type='five-alive'),1),'rules',(SELECT config FROM private.arcade_rulesets WHERE id='five-alive/1')))
 ELSE '[]'::jsonb END
 ||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release$new$;
 IF strpos(src,$needle$FROM private.five_alive_release WHERE singleton$needle$)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:capability_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 EXECUTE src;
END $$;
