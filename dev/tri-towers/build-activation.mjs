import {readFile,writeFile} from 'node:fs/promises';
const authority=await readFile('supabase/tri-towers/authority.sql','utf8');
const boundary=authority.indexOf('-- Acquire shared-table locks last.');
if(boundary<0)throw new Error('Missing final lock boundary');
const before=`-- TriTowers approved-account, fake-money production activation.
-- No existing function, trigger, policy, catalog row, session or ledger changes.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='10s';
CREATE TEMP TABLE tri_catalog_before ON COMMIT DROP AS SELECT * FROM public.game_defaults;
CREATE TEMP TABLE tri_functions_before ON COMMIT DROP AS
 SELECT p.oid,md5(pg_get_functiondef(p.oid)) fingerprint FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p');
`;
const activation=`
-- The catalog has no display-name column; the client maps this key to TriTowers.
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
 VALUES('tri-towers','fullscreen',5,false,'none','none',false,false,false,0,0);
UPDATE private.tri_towers_release SET enabled=true;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tri_towers_revisions;
SELECT cron.schedule('tri-towers-recovery','5 seconds','SET statement_timeout = ''3s''; SELECT private.tri_towers_recover()');
DO $$ BEGIN
 IF EXISTS(SELECT * FROM tri_catalog_before EXCEPT SELECT * FROM public.game_defaults) THEN RAISE EXCEPTION 'tri_towers:existing_catalog_changed';END IF;
 IF EXISTS(SELECT 1 FROM tri_functions_before WHERE md5(pg_get_functiondef(oid))<>fingerprint) THEN RAISE EXCEPTION 'tri_towers:existing_function_changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_xact_user_tables WHERE schemaname IN ('public','private') AND relname NOT LIKE 'tri_towers_%' AND relname<>'game_defaults' AND n_tup_ins+n_tup_upd+n_tup_del>0)
 THEN RAISE EXCEPTION 'tri_towers:unexpected_application_write';END IF;
END $$;
-- Only the bounded foreign-key/trigger statements remain under shared locks.
SET LOCAL statement_timeout='1s';
`;
const sql=before+authority.slice(0,boundary)+activation+authority.slice(boundary)+'\nCOMMIT;\n';
await writeFile('supabase/migrations/20261015003637_activate_tri_towers_test_play.sql',sql);
console.log('Built activation migration from reviewed authority source.');
