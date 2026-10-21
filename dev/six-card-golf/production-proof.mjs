// Offline builder only. No database client, credentials or execution path.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const migrationPath='supabase/migrations/20261021011905_six_card_golf_v1.sql';
export const migrationHash='95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e';
const names=['core-proof','proof','financial-proof','recovery-proof','mixed-proof','qualification-proof'];
const seed="UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';";
const expectedSeeds={'core-proof':0,proof:1,'financial-proof':1,'recovery-proof':0,'mixed-proof':2,'qualification-proof':0};
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const body=s=>s.replaceAll('\r\n','\n');
export function sanitizeFixture(name,source){
 let sql=body(source),count=sql.split(seed).length-1;
 if(count!==expectedSeeds[name])throw Error(`Unexpected heartbeat seed count in ${name}: ${count}`);
 sql=sql.replaceAll(seed,'-- Scheduler health is read from actual authority; never seeded.');
 if(name==='recovery-proof'){
  const start=sql.indexOf(' -- A corrupt committed partition');
  const end=sql.indexOf('\nEND $$;',start);
  if(start<0||end<start)throw Error('Missing exact local-only corruption section');
  sql=sql.slice(0,start)+'\n -- Deliberate corruption injection remains local-only; no trigger is disabled here.'+sql.slice(end);
 }
 if(/(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+private\.game_recovery_dispatch_state/i.test(sql))throw Error('Heartbeat mutation forbidden');
 if(/DISABLE\s+TRIGGER|session_replication_role|ALTER\s+(?:ROLE|SYSTEM)|\bCOMMIT\s*;/i.test(sql))throw Error('Unsafe fixture operation');
 return sql.replaceAll('gen_random_uuid()','pg_temp.golf_fixture_uuid()');
}

// Capture complete existing rows inside the proof's consistent snapshot. These
// hashes never leave the database; a concurrent user's legitimate commit is not
// mistaken for a proof mutation. All inserts outside the fixture scope fail too.
const tracked=[
 ['auth.users','id'],['public.profiles','id'],['public.games','id'],
 ['public.players','id'],['public.dealer_games','session_id'],['public.rounds','game_id'],
 ['public.game_results','game_id'],['public.session_player_snapshots','game_id'],
 ['public.gameplay_transfer_batches','game_id'],['public.gameplay_transfer_pending_changes','game_id'],
];
const tableValues=tracked.map(([t,c])=>`(${quote(t)},${quote(c)})`).join(',');
export const healthCheck=`DO $health$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_extension WHERE extname='pg_cron')
  OR to_regprocedure('cron.schedule(text,text,text)') IS NULL
  OR current_setting('wal_level')<>'logical'
  OR NOT EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime')
 THEN RAISE EXCEPTION 'golf_proof:live_services_required';END IF;
 IF NOT EXISTS(SELECT FROM private.game_recovery_dispatch_state
  WHERE last_outcome='completed' AND last_completed_at BETWEEN clock_timestamp()-interval '15 seconds' AND clock_timestamp())
 THEN RAISE EXCEPTION 'golf_proof:live_scheduler_stale';END IF;
 IF EXISTS(SELECT FROM public.games WHERE game_type='six-card-golf')
  OR EXISTS(SELECT FROM public.game_results WHERE game_type='six-card-golf')
 THEN RAISE EXCEPTION 'golf_proof:requires_pristine_closed_golf';END IF;
END $health$;`;

const functionSnapshot=`SELECT jsonb_object_agg(p.oid::regprocedure::text,
 md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10))))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('public','private') AND (p.proname LIKE 'golf_%'
 OR p.oid IN(to_regprocedure('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'),
 to_regprocedure('private.megatouch_frozen_stake()'),to_regprocedure('private.megatouch_begin(uuid,uuid)'),
 to_regprocedure('public.settle_gameplay_chip_transfers(uuid,jsonb,text)'),
 to_regprocedure('public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)'),
 to_regprocedure('public.set_game_paused(uuid,boolean,uuid,bigint)'),
 to_regprocedure('private.split_whole_chips_clockwise(uuid,uuid[],integer,integer)'),to_regprocedure('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)')))`;

const catalogSnapshot=`WITH tables AS (
 SELECT c.oid,n.nspname||'.'||c.relname name,c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND ((n.nspname IN('private','public') AND c.relname LIKE 'golf_%')
 OR (n.nspname='public' AND c.relname IN('games','players','dealer_games','rounds','game_results','session_player_snapshots','gameplay_transfer_batches','gameplay_transfer_pending_changes')))
), items AS (
 SELECT 'table:'||name k,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)::text v FROM tables
 UNION ALL SELECT 'constraint:'||t.name||':'||c.conname,pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid
 UNION ALL SELECT 'column:'||t.name||':'||a.attname,jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text FROM pg_attribute a JOIN tables t ON t.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'trigger:'||t.name||':'||g.tgname,jsonb_build_array(g.tgenabled,pg_get_triggerdef(g.oid))::text FROM pg_trigger g JOIN tables t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal
 UNION ALL SELECT 'index:'||t.name||':'||c.relname,pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN tables t ON t.oid=i.indrelid JOIN pg_class c ON c.oid=i.indexrelid
 UNION ALL SELECT 'policy:'||t.name||':'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text FROM pg_policy p JOIN tables t ON t.oid=p.polrelid
 UNION ALL SELECT 'function-acl:'||p.oid::regprocedure::text,coalesce(p.proacl::text,'default') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND (p.proname LIKE 'golf_%' OR p.proname IN('settle_gameplay_chip_transfers','submit_ante_decision','set_game_paused','set_automatic_play','megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake','split_whole_chips_clockwise'))
) SELECT md5(jsonb_object_agg(k,v)::text) FROM items`;

function containment(prefix){return `
CREATE TEMP TABLE golf_existing(table_name text,row_hash text) ON COMMIT DROP;
DO $baseline$ DECLARE t record;BEGIN
 FOR t IN SELECT * FROM (VALUES ${tableValues}) v(table_name,scope_column) LOOP
  EXECUTE format('INSERT INTO pg_temp.golf_existing SELECT %L,md5(to_jsonb(x)::text) FROM %s x',t.table_name,t.table_name);
  IF EXISTS(SELECT FROM pg_temp.golf_existing WHERE table_name=t.table_name AND row_hash IS NULL) THEN RAISE EXCEPTION 'golf_proof:invalid_baseline';END IF;
 END LOOP;
END $baseline$;
CREATE TEMP SEQUENCE golf_fixture_ids;
CREATE TEMP TABLE golf_metrics(name text,value integer) ON COMMIT DROP;
CREATE FUNCTION pg_temp.golf_fixture_uuid() RETURNS uuid LANGUAGE sql VOLATILE AS
 $$ SELECT (${quote(prefix+'-a000-')}||lpad(to_hex(nextval('pg_temp.golf_fixture_ids')),12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.golf_unchanged() RETURNS void LANGUAGE plpgsql AS $check$
DECLARE t record;bad boolean;BEGIN
 FOR t IN SELECT * FROM (VALUES ${tableValues}) v(table_name,scope_column) LOOP
  EXECUTE format('SELECT EXISTS((SELECT row_hash FROM pg_temp.golf_existing WHERE table_name=%L EXCEPT ALL SELECT md5(to_jsonb(x)::text) FROM %s x) UNION ALL (SELECT md5(to_jsonb(x)::text) FROM %s x WHERE x.%I::text NOT LIKE %L EXCEPT ALL SELECT row_hash FROM pg_temp.golf_existing WHERE table_name=%L))',t.table_name,t.table_name,t.table_name,t.scope_column,${quote(prefix+'%')},t.table_name) INTO bad;
  IF bad THEN RAISE EXCEPTION 'golf_proof:existing_or_unscoped_records_changed:%',t.table_name;END IF;
 END LOOP;
END $check$;
`;}

function residualCheck(prefix){return `DO $residual$ DECLARE t record;n bigint;BEGIN
 FOR t IN SELECT * FROM (VALUES ${tableValues}) v(table_name,scope_column) LOOP
  EXECUTE format('SELECT count(*) FROM %s WHERE %I::text LIKE %L',t.table_name,t.scope_column,${quote(prefix+'%')}) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'golf_proof:residual_or_collision:%',t.table_name;END IF;
 END LOOP;
END $residual$;`;}

function installedGuard(fingerprints,catalogFingerprint){
 if(!fingerprints||Object.keys(fingerprints).length<20||Object.entries(fingerprints).some(([k,v])=>!/^(?:public\.|private\.)?[a-z_][a-z0-9_]*\([^;']*\)$/.test(k)||!/^[a-f0-9]{32}$/.test(v)))throw Error('Installed proofs require reviewed candidate function_fingerprints');
 if(!/^[a-f0-9]{32}$/.test(catalogFingerprint??''))throw Error('Installed proofs require reviewed candidate catalog_fingerprint');
 return `DO $installed$ BEGIN
 IF to_regclass('private.golf_release') IS NULL THEN RAISE EXCEPTION 'golf_proof:not_installed';END IF;
 IF NOT EXISTS(SELECT FROM private.golf_release WHERE singleton AND NOT enabled AND NOT admission_enabled)
  OR EXISTS(SELECT FROM private.golf_matches) OR EXISTS(SELECT FROM public.golf_revisions)
  OR EXISTS(SELECT FROM private.golf_qualification) OR EXISTS(SELECT FROM private.golf_qualified_matches)
 THEN RAISE EXCEPTION 'golf_proof:installed_authority_not_pristine_closed';END IF;
 IF (${functionSnapshot}) IS DISTINCT FROM ${quote(JSON.stringify(fingerprints))}::jsonb THEN RAISE EXCEPTION 'golf_proof:installed_function_drift';END IF;
 IF (${catalogSnapshot}) IS DISTINCT FROM ${quote(catalogFingerprint)} THEN RAISE EXCEPTION 'golf_proof:installed_catalog_drift';END IF;
 IF NOT EXISTS(SELECT FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='golf_revisions')
  OR NOT EXISTS(SELECT FROM cron.job WHERE jobname='six-card-golf-recovery' AND active AND schedule='1 second'
   AND database=current_database() AND command='SET statement_timeout=''3s''; SELECT private.golf_recover()')
 THEN RAISE EXCEPTION 'golf_proof:installed_services_missing';END IF;
END $installed$;`;
}

export function buildProofs({migration,fixtures,installed=false,fingerprints,catalogFingerprint,namespace=randomUUID().slice(0,18)}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}$/.test(namespace))throw Error('Invalid fixture namespace');
 if(createHash('sha256').update(migration).digest('hex')!==migrationHash)throw Error('Migration bytes changed; review and repin explicitly');
 const clean=Object.fromEntries(names.map(n=>[n,sanitizeFixture(n,fixtures[n])]));
 const assertFn=clean['core-proof'].slice(0,clean['core-proof'].indexOf('\nDO $$'));
 const loginFn=clean.proof.slice(0,clean.proof.indexOf('\nDO $$'));
 const suites=[['core',clean['core-proof']],['human',clean.proof],['financial',clean['financial-proof']],['recovery',clean['recovery-proof']],['qualification',clean['qualification-proof']]];
 for(const money of [0,1])for(const n of [2,3,4]){
  let sql=clean['mixed-proof'];
  const loop='FOR money IN 0..1 LOOP FOR n IN 2..4 LOOP';
  if(sql.split(loop).length!==2)throw Error('Mixed loop changed');
  sql=sql.replace(loop,`FOR money IN ${money}..${money} LOOP FOR n IN ${n}..${n} LOOP`);
  // A particular random match need not end on a bot; retain aggregate evidence
  // in returned counts rather than falsifying a per-case bot-finish assertion.
  const botAssertion="PERFORM pg_temp.golf_assert(bot_finishes>0,'earned zero-client bot final action and settlement');";
  if(sql.split(botAssertion).length!==2)throw Error('Mixed bot-finish assertion changed');
  sql=sql.replace(botAssertion,"INSERT INTO pg_temp.golf_metrics VALUES('bot_finishes',bot_finishes);");
  suites.push([`mixed-${money?'real':'fake'}-${n}`,sql]);
 }
 const guard=installed?installedGuard(fingerprints,catalogFingerprint):`DO $$ BEGIN IF to_regclass('private.golf_release') IS NOT NULL THEN RAISE EXCEPTION 'golf_proof:candidate_already_installed';END IF;END $$;`;
 return suites.map(([name,fixture],index)=>{
  // Different namespace per unit makes artifact mixing detectable.
  const prefix=namespace.slice(0,14)+'4'+index.toString(16).padStart(3,'0');
  const sql=`-- OFFLINE GENERATED ${installed?'INSTALLED':'CANDIDATE'} proof: ${name}. Requires separately authorized execution.
-- Run one complete payload with stop-on-error; any error requires ROLLBACK and connection close.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=public;
${healthCheck}
${guard}
${residualCheck(prefix)}
${containment(prefix)}
${installed?'':body(migration)}
SET LOCAL statement_timeout='15s';
${assertFn}
${loginFn}
UPDATE private.golf_release SET enabled=true,admission_enabled=true;
-- The flag change is uncommitted and invisible to browser/cron connections.
${fixture}
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.golf_unchanged();
SELECT jsonb_build_object('unit',${quote(name)},'function_fingerprints',(${functionSnapshot}),'catalog_fingerprint',(${catalogSnapshot}),'metrics',(SELECT jsonb_object_agg(name,value) FROM pg_temp.golf_metrics),'fixture_namespace',${quote(prefix)},'existing_records_unchanged',true) candidate_evidence;
ROLLBACK;
${residualCheck(prefix)}
${installed?guard:`DO $$ BEGIN IF to_regclass('private.golf_release') IS NOT NULL OR EXISTS(SELECT FROM cron.job WHERE jobname='six-card-golf-recovery') THEN RAISE EXCEPTION 'golf_proof:candidate_not_rolled_back';END IF;END $$;`}
SELECT jsonb_build_object('unit',${quote(name)},'rollback_verified',true,'fixture_namespace',${quote(prefix)},'golf_release_exists',to_regclass('private.golf_release') IS NOT NULL) rollback_evidence;
`;
  return {name,sql,namespace:prefix,sha256:createHash('sha256').update(sql).digest('hex')};
 });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),installed=args.includes('--installed');
 if(args.some((a,i)=>!['--installed','--fingerprints'].includes(a)&&args[i-1]!=='--fingerprints'))throw Error('Usage: node dev/six-card-golf/production-proof.mjs [--installed --fingerprints reviewed.json]');
 const fp=args.indexOf('--fingerprints');
 const reviewed=fp<0?undefined:JSON.parse(readFileSync(args[fp+1],'utf8'));
 if(installed&&(reviewed?.migrationHash!==migrationHash||reviewed?.units!==11||reviewed?.installed!==false))throw Error('Use the validated candidate evidence file for this exact migration');
 const units=buildProofs({migration:readFileSync(migrationPath,'utf8'),fixtures:Object.fromEntries(names.map(n=>[n,readFileSync(`supabase/six-card-golf/${n}.sql`,'utf8')])),installed,fingerprints:reviewed?.function_fingerprints,catalogFingerprint:reviewed?.catalog_fingerprint});
 const out=`qualification.local/six-card-golf/production-${installed?'installed':'candidate'}`;
 mkdirSync(out,{recursive:true});
 for(const u of units)writeFileSync(`${out}/${u.name}.sql`,u.sql);
 writeFileSync(`${out}/manifest.json`,JSON.stringify({migrationPath,migrationHash,installed,generatedAt:new Date().toISOString(),executed:false,units:units.map(({sql,...m})=>m),limits:['Actual cron/Realtime/browser execution not proved','Independent-connection races remain separate','Corrupt committed state injection is local-only','Require at least one actual bot-finishes result across mixed units']},null,2));
 console.log(`Prepared ${units.length} rollback-only units in ${out}; no database connection or execution.`);
}
