import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:'));
const capture=JSON.parse(fs.readFileSync(path.join(dir,'capture.json'),'utf8'));
const find=s=>capture.functions.find(x=>x.signature===s);
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function once(s,needle,replacement){if(s.split(needle).length!==2)throw Error('Non-unique patch anchor: '+needle);return s.replace(needle,replacement);}
const settle=find('private.farkle_settle_v1(uuid)');
const finalizer=find('finalize_gameplay_transfer_batch()');
let fixedSettle=once(settle.definition," PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','settled'",` INSERT INTO private.farkle_terminal_transfers_v2(transaction_id,game_id,dealer_game_id,round_id,result_id,action_sequence,opening_balances,closing_balances)
 SELECT txid_current(),g.id,d.id,r.id,result_id,(s->>'actionSequence')::bigint,
  jsonb_object_agg('player:'||p.id::text,p.chips-(changes->>p.id::text)::integer),
  jsonb_object_agg('player:'||p.id::text,p.chips)
 FROM public.players p WHERE p.game_id=g.id AND changes ? p.id::text;
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','settled'`);
let fixedFinalizer=once(finalizer.definition,'  v_transaction_id bigint := txid_current();','  v_transaction_id bigint := txid_current();\n  v_farkle_prior_claim text;');
fixedFinalizer=once(fixedFinalizer,'      UPDATE public.games\n         SET chip_transfer_cursor',`      -- Only the exact deferred Farkle terminal transfer may acquire this claim.
      v_farkle_prior_claim := NULL;
      IF EXISTS(SELECT 1 FROM public.games WHERE id=v_game_id AND game_type='farkle') THEN
        v_farkle_prior_claim := private.farkle_begin_terminal_transfer_v2(v_game_id,v_transaction_id,v_opening,v_closing);
      END IF;
      UPDATE public.games
         SET chip_transfer_cursor`);
fixedFinalizer=once(fixedFinalizer,'           SELECT key FROM jsonb_object_keys(v_opening) AS endpoint(key)\n         );',`           SELECT key FROM jsonb_object_keys(v_opening) AS endpoint(key)
         );
      IF v_farkle_prior_claim IS NOT NULL THEN
        PERFORM set_config('app.farkle_authority',v_farkle_prior_claim,true);
      END IF;`);
function guard(f,hashes){return `DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=${quote(f.signature)}::regprocedure AND md5(pg_get_functiondef(p.oid)) IN (${hashes.map(quote).join(',')}) AND pg_get_userbyid(p.proowner)=${quote(f.owner)} AND p.prosecdef=${f.securityDefiner} AND p.proconfig IS NOT DISTINCT FROM ARRAY[${f.config.map(quote).join(',')}]::text[] AND p.proacl::text IS NOT DISTINCT FROM ${quote(f.acl)} AND p.provolatile=${quote(f.volatility)} AND p.proparallel=${quote(f.parallel)} AND p.proleakproof=${f.leakproof} AND p.proisstrict=${f.strict}) THEN RAISE EXCEPTION 'farkle_transfer:definition_or_metadata_drift'; END IF; END $guard$;\n`;}
const owners=[[settle,fixedSettle],[finalizer,fixedFinalizer]];
const guards=owners.map(([f,body])=>guard(f,[f.md5,md5(body)])).join('');
const authority=fs.readFileSync(path.join(dir,'authority.sql'),'utf8');
const candidate='-- Additive Farkle terminal COMMIT handoff. Production scoring remains unapproved.\n'+guards+authority+'\n'+fixedSettle+';\n'+fixedFinalizer+';\n';
const recover=guards+`-- Lock gameplay before taking exclusive creation ownership; wait out in-flight actions.
SELECT id FROM public.games WHERE game_type='farkle' ORDER BY id FOR UPDATE;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
DO $quiesce$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress','game_over'))
 OR EXISTS(SELECT 1 FROM private.farkle_terminal_transfers_v2) THEN
 RAISE EXCEPTION 'farkle_transfer:active_games_require_compatible_recovery'; END IF;
END $quiesce$;
`+owners.map(([f])=>f.definition+';\n').join('')+owners.map(([f])=>guard(f,[f.md5])).join('');
fs.writeFileSync(path.join(dir,'candidate.sql'),candidate);
fs.writeFileSync(path.join(dir,'restore-body.sql'),recover);
fs.writeFileSync(path.join(dir,'restore-shared.sql'),'BEGIN;\n'+recover+'COMMIT;\n');
const migration='20260921172016_farkle_terminal_transfer_handoff.sql';
fs.writeFileSync(path.join(dir,'../../migrations',migration),candidate);
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({migration,baselineSha:'4230f07c3705d73419e1042e2394e6293b3fedec',owners:owners.map(([f,b])=>({signature:f.signature,baselineMd5:f.md5,candidateMd5:md5(b),owner:f.owner,securityDefiner:f.securityDefiner,config:f.config,acl:f.acl})),scope:'Farkle-only deferred terminal transfer claim; unchanged guards and non-Farkle calculations'},null,2)+'\n');
console.log('Generated additive candidate, guarded recovery and metadata manifest.');
