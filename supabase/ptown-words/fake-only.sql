-- New admission only. No change to existing match clocks, results or balances.
DO $fake$
DECLARE source text;changed text;
BEGIN
 SELECT pg_get_functiondef('public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure) INTO source;
 changed:=replace(source,'SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;',
  'SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;'||chr(10)||' IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION ''ptown_words:fake_money_only'' USING ERRCODE=''42501'';END IF;');
 IF changed=source OR strpos(source,'ptown_words:fake_money_only')>0 THEN RAISE EXCEPTION 'Words fake-only configure preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure) INTO source;
 changed:=replace(source,'IF g.game_type=''quintzee'' AND (',
  'IF g.game_type=''ptown-words'' AND g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION ''ptown_words:fake_money_only'' USING ERRCODE=''42501'';END IF;'||chr(10)||' IF g.game_type=''quintzee'' AND (');
 IF changed=source OR strpos(source,'ptown_words:fake_money_only')>0 THEN RAISE EXCEPTION 'Words fake-only begin preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('public.ptown_words_capabilities(uuid)'::regprocedure) INTO source;
 changed:=replace(replace(replace(source,'''fake_money_only'',false','''fake_money_only'',true'),'''version'',2','''version'',3'),
  'EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)','EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id AND real_money IS FALSE)');
 IF changed=source OR strpos(changed,'''version'',3')=0 OR strpos(changed,'AND real_money IS FALSE')=0 THEN RAISE EXCEPTION 'Words fake-only capability preimage missing';END IF;EXECUTE changed;
END $fake$;
