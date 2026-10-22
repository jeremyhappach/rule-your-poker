// Offline builder. One bounded connector request per proof, intentional rollback,
// actual presentation hold, no synthetic scheduler health or lease manipulation.
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/canasta/hosted';mkdirSync(dir,{recursive:true});
const installed=process.argv.includes('--installed');
const source=p=>read('supabase/canasta/'+p,'utf8').replaceAll('\r\n','\n');
const installation=source('release/closed-install.sql').replace(/^BEGIN;\n/m,'').replace(/^COMMIT;\n/m,'');
const tables=[['auth.users','id'],['public.profiles','id'],['public.games','id'],['public.players','game_id'],['public.dealer_games','session_id'],['public.rounds','game_id'],['public.game_results','game_id'],['public.session_player_snapshots','game_id'],['public.gameplay_transfer_batches','game_id'],['public.gameplay_transfer_pending_changes','game_id']];
const tableValues=tables.map(([t,c])=>`('${t}','${c}')`).join(',');
const clean=sql=>sql.replace(/INSERT INTO auth\.users\(id\) VALUES\(([^;]+)\);/g,(_,id)=>`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${id},jsonb_build_object('username','Canasta fixture '||${id}::text));`).replaceAll('gen_random_uuid()','pg_temp.canasta_fixture_uuid()');
const financial=source('proof.sql');
const assertion=financial.slice(0,financial.indexOf('\nDO $$'));
const cases=installed?['financial-fake','financial-real','failure','admission','qualification']:['financial-fake','financial-real','failure'];
const manifest=[];
for(const name of cases){
 const prefix=randomUUID().slice(0,18),money=name==='financial-real'?1:0;
 let fixture=name.startsWith('financial')||name==='failure'?financial.replace('FOR money_i IN 0..1 LOOP',`FOR money_i IN ${money}..${money} LOOP`):assertion+'\n'+source(name+'.proof.sql');
 if(name==='failure'){
  const at=fixture.indexOf("  reply:=public.canasta_server_commit(dealer,2,next_i,'{\"kind\":\"recover\"}');");assert(at>0);
  fixture=fixture.slice(0,at)+`  PERFORM set_config('canasta.proof.match',dealer::text,true);
  BEGIN PERFORM public.canasta_server_commit(dealer,2,next_i,'{"kind":"recover"}');RAISE EXCEPTION 'missing injected failure';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta_proof:injected_snapshot_failure' THEN RAISE;END IF;END;
  PERFORM pg_temp.canasta_assert((SELECT bool_and(chips=100) FROM public.players WHERE game_id=game),'failed settlement restores chips');
  PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=dealer) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer) AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE dealer_game_id=dealer),'failed settlement restores result ledger snapshots');
  PERFORM pg_temp.canasta_assert((SELECT revision=2 AND settlement IS NULL FROM private.canasta_matches WHERE dealer_game_id=dealer),'failed settlement restores authority');
 END LOOP;END $$;`;
  fixture=`CREATE FUNCTION pg_temp.canasta_inject() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.dealer_game_id::text=current_setting('canasta.proof.match',true) THEN RAISE EXCEPTION 'canasta_proof:injected_snapshot_failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER canasta_proof_inject BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.canasta_inject();\n`+fixture;
 }
 if(name.startsWith('financial')){
  const old="UPDATE private.canasta_matches SET settlement=jsonb_set(settlement,'{deadline}','0') WHERE dealer_game_id=dealer;";
  assert.equal(fixture.split(old).length,2);
  fixture=fixture.replace(old,"PERFORM pg_sleep(greatest(0,((SELECT (settlement->>'deadline')::bigint FROM private.canasta_matches WHERE dealer_game_id=dealer)-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0));");
 }
 fixture=clean(fixture);
 assert(!/UPDATE\s+private\.(?:canasta_recovery_state|game_recovery_dispatch_state)|DISABLE\s+TRIGGER|ALTER\s+(?:ROLE|SYSTEM)/i.test(fixture));
 const sql=`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms';SET LOCAL statement_timeout='15s';SET LOCAL idle_in_transaction_session_timeout='20s';SET LOCAL search_path=public;
DO $health$ BEGIN IF NOT EXISTS(SELECT FROM private.game_recovery_dispatch_state WHERE last_outcome='completed' AND last_completed_at>clock_timestamp()-interval '15 seconds') THEN RAISE EXCEPTION 'canasta_proof:live_scheduler_stale';END IF;END $health$;
${installed?'SELECT private.canasta_assert_recovery_health();':"DO $$ BEGIN IF to_regclass('private.canasta_release') IS NOT NULL THEN RAISE EXCEPTION 'canasta_proof:already_installed';END IF;END $$;"}
CREATE TEMP SEQUENCE canasta_fixture_ids;
CREATE FUNCTION pg_temp.canasta_fixture_uuid() RETURNS uuid LANGUAGE sql VOLATILE AS $$SELECT ('${prefix}-a000-'||lpad(to_hex(nextval('pg_temp.canasta_fixture_ids')),12,'0'))::uuid$$;
CREATE FUNCTION pg_temp.canasta_history_hash() RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE t record;h text;out_i jsonb:='{}';BEGIN
 FOR t IN SELECT * FROM (VALUES ${tableValues}) x(n,k) LOOP
 EXECUTE format('SELECT md5(coalesce(string_agg(md5(to_jsonb(x)::text),'''' ORDER BY md5(to_jsonb(x)::text)),'''')) FROM %s x WHERE x.%I::text NOT LIKE %L',t.n,t.k,'${prefix}%') INTO h;
 out_i:=out_i||jsonb_build_object(t.n,h);END LOOP;RETURN out_i;END $fn$;
CREATE TEMP TABLE canasta_hosted_evidence(value jsonb) ON COMMIT DROP;
DO $unit$ DECLARE during_i jsonb;BEGIN
 BEGIN
  EXECUTE $body$${installed?'':installation}
  ${fixture}
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT pg_temp.canasta_history_hash();$body$ INTO during_i;
  IF during_i IS NULL THEN RAISE EXCEPTION 'canasta_proof:missing_history_capture';END IF;
  RAISE EXCEPTION SQLSTATE 'P0C01' USING MESSAGE='canasta_proof:intentional_rollback';
 EXCEPTION WHEN SQLSTATE 'P0C01' THEN NULL;END;
 IF during_i IS DISTINCT FROM pg_temp.canasta_history_hash() THEN RAISE EXCEPTION 'canasta_proof:unscoped_history_changed';END IF;
 ${installed?'':"IF to_regclass('private.canasta_release') IS NOT NULL THEN RAISE EXCEPTION 'canasta_proof:rollback_schema_failed';END IF;"}
 INSERT INTO canasta_hosted_evidence VALUES(jsonb_build_object('unit','${name}','installed',${installed},'passed',true,'unscoped_history_preserved',true,'rollback_verified',true,'namespace','${prefix}'));
END $unit$;
SELECT * FROM canasta_hosted_evidence;`;
 const file=`${dir}/${installed?'installed':'candidate'}-${name}.sql`;write(file,sql);
 manifest.push({name,file,sha256:createHash('sha256').update(sql).digest('hex')});
}
write(dir+'/'+(installed?'installed':'candidate')+'-manifest.json',JSON.stringify({at:new Date().toISOString(),installed,units:manifest},null,2));
console.log(JSON.stringify(manifest));
