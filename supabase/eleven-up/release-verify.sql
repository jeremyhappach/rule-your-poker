-- READ ONLY. Every boolean must be true after installation (and after a retry).
SELECT jsonb_build_object(
 'bot_creation_fake_only',position('create_session_bot:fake_money_only' IN pg_get_functiondef('public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid)'::regprocedure))>0,
 'configure_fake_only',position('eleven_up:bots_fake_money_only' IN pg_get_functiondef('public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure))>0,
 'consent_fake_only',position('eleven_up:bots_fake_money_only' IN pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure))>0,
 'bot_schedule_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.eleven_up_matches'::regclass AND tgname='eleven_up_bot_schedule' AND tgenabled='O'),
 'due_index',EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('private.eleven_up_matches_bot_due') AND indisvalid),
 'policy_private',NOT has_function_privilege('authenticated','private.eleven_up_bot_choice(jsonb,bigint)','EXECUTE') AND NOT has_function_privilege('anon','private.eleven_up_bot_choice(jsonb,bigint)','EXECUTE'),
 'recovery_private',NOT has_function_privilege('authenticated','private.eleven_up_recover()','EXECUTE'),
 'same_reducer',position('private.eleven_up_reduce(m.state,choice->>''action''' IN pg_get_functiondef('private.eleven_up_recover()'::regprocedure))>0,
 'same_settlement',position('private.eleven_up_settle(m.dealer_game_id)' IN pg_get_functiondef('private.eleven_up_recover()'::regprocedure))>0
) AS eleven_up_bot_release_verification;
