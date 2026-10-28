-- Isolated preparation only. Hosted installation/activation is held for the
-- incident -> 11 Up -> live Words release order. Preserve fake admission/bots.
ALTER TABLE private.ptown_words_release ADD COLUMN real_qualified boolean NOT NULL DEFAULT false;
DO $patch$
DECLARE source text; changed text;
BEGIN
 SELECT pg_get_functiondef('public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure) INTO source;
 changed:=replace(source,
  'IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION ''ptown_words:fake_money_only'' USING ERRCODE=''42501'';END IF;',
  'IF g.real_money IS DISTINCT FROM false AND NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION ''ptown_words:real_money_closed'' USING ERRCODE=''42501'';END IF;');
 IF changed=source THEN RAISE EXCEPTION 'Words real admission configure preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure) INTO source;
 changed:=replace(source,
  'IF g.game_type=''ptown-words'' AND g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION ''ptown_words:fake_money_only'' USING ERRCODE=''42501'';END IF;',
  'IF g.game_type=''ptown-words'' AND g.real_money IS DISTINCT FROM false AND NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION ''ptown_words:real_money_closed'' USING ERRCODE=''42501'';END IF;');
 IF changed=source THEN RAISE EXCEPTION 'Words real admission begin preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('public.ptown_words_capabilities(uuid)'::regprocedure) INTO source;
 changed:=replace(source,'id=p_session_id AND real_money IS FALSE',
  'id=p_session_id AND (real_money IS FALSE OR EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND real_qualified))');
 IF changed=source THEN RAISE EXCEPTION 'Words real capability session preimage missing';END IF;source:=changed;
 changed:=replace(source,'''version'',3',
  '''version'',CASE WHEN EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND real_qualified) THEN 4 ELSE 3 END');
 IF changed=source THEN RAISE EXCEPTION 'Words real capability version preimage missing';END IF;source:=changed;
 changed:=replace(source,'''fake_money_only'',true',
  '''fake_money_only'',NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND real_qualified)');
 IF changed=source THEN RAISE EXCEPTION 'Words real capability mode preimage missing';END IF;EXECUTE changed;
END $patch$;
-- No rule, timeout, bank, pause, settlement, recovery or async authority changes.
-- No activation here: the new flag remains false until all release gates pass.
