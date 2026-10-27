-- Run in a transaction only after exact-SHA production READY and publication proof.
-- Caller sets LOCAL ptown_words.release_sha to the verified 40-character commit.
DO $activation$
DECLARE expected text:=current_setting('ptown_words.release_sha');f record;
BEGIN
 IF expected !~ '^[a-f0-9]{40}$' OR NOT EXISTS(SELECT 1 FROM public.system_settings WHERE key='release_publication' AND value->>'buildSha'=expected) THEN RAISE EXCEPTION 'Words release publication mismatch';END IF;
 FOR f IN SELECT * FROM (VALUES
 ('private.ptown_words_actor_allowed(uuid)','abc8b61b9001aa94636d9fd2f05ae710'),
 ('private.megatouch_begin(uuid,uuid)','cb6c2e49ac9080560868fb0a9162d890'),
 ('public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamptz)','715cd76863b0117b48137fe29f309eb8'),
 ('private.ptown_words_reduce(jsonb,text,jsonb,bigint)','9918e5828d8f9f1b14cca55ccca5a135'),
 ('private.ptown_words_settle(uuid)','78c88259dc6febe62bf200cab836b956'),
 ('private.ptown_words_schedule_bot()','7c99314db6caf45ecc065a6711054f71'),
 ('private.ptown_words_present_move()','6120140551b7766332abbd010eb10e65'),
 ('private.ptown_words_bot_choice(jsonb,bigint)','f31519f25cf6b338c8666b452a714f08'),
 ('public.ptown_words_capabilities(uuid)','702b0cbc1f3f8489bc0c1a82ef21ad21')) v(signature,hash)
 LOOP IF md5(pg_get_functiondef(f.signature::regprocedure))<>f.hash THEN RAISE EXCEPTION 'Words installed function changed: %',f.signature;END IF;END LOOP;
 IF (SELECT count(*) FROM private.ptown_words_bot_vocabulary)<>2599 THEN RAISE EXCEPTION 'Words vocabulary mismatch';END IF;
 UPDATE private.ptown_words_release SET admission_enabled=true,bots_enabled=true WHERE singleton AND enabled AND NOT admission_enabled AND NOT bots_enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'Words activation state changed';END IF;
END $activation$;
