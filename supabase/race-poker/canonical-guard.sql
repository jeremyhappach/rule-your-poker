-- Refuse to overwrite a newer canonical owner. Reinspect drift; never remove this guard to force installation.
DO $$ BEGIN
 IF md5(pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure))<>'18f1042a7eb294005b3c9d3eaee2d767'
 OR md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure))<>'4103ca5c1f6acd06c89c4d86fcfa2c91'
 OR md5(pg_get_functiondef('private.megatouch_frozen_stake()'::regprocedure))<>'d3efe1f605eea056169a8b674017958f'
 OR md5(pg_get_functiondef('public.settle_gameplay_chip_transfers(uuid,jsonb,text)'::regprocedure))<>'de14ab5df0a703cfd8c1ed43aa5a819c'
 OR md5(pg_get_functiondef('public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)'::regprocedure))<>'c633a318c7f2605104c92e03d3b3b09a'
 THEN RAISE EXCEPTION 'race_poker:canonical_definition_drift';END IF;
END $$;
