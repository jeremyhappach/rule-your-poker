import fs from 'node:fs';
const dir='supabase/farkle/commit-boundary/';
const read=p=>fs.readFileSync(p,'utf8');
const capture=JSON.parse(read(dir+'capture.json'));
const manifest=JSON.parse(read(dir+'manifest.json'));
const q=s=>"'"+s.replaceAll("'","''")+"'";
const assertions=capture.functions.map(f=>{
 const hash=manifest.owners.find(x=>x.signature===f.signature)?.candidateMd5??f.md5;
 return `IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=${q(f.signature)}::regprocedure AND md5(pg_get_functiondef(p.oid))=${q(hash)} AND pg_get_userbyid(p.proowner)=${q(f.owner)} AND p.prosecdef=${f.securityDefiner} AND p.proconfig IS NOT DISTINCT FROM ARRAY[${f.config.map(q)}]::text[] AND p.proacl::text=${q(f.acl)}) THEN RAISE EXCEPTION 'commit_boundary:metadata_or_immutable_owner_drift'; END IF;`;
}).join('\n');
const verification=`DO $verify$ BEGIN
${assertions}
IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.farkle_terminal_transfers_v2'::regclass AND relrowsecurity AND pg_get_userbyid(relowner)='postgres')
 OR has_table_privilege('authenticated','private.farkle_terminal_transfers_v2','INSERT')
 OR has_table_privilege('service_role','private.farkle_terminal_transfers_v2','INSERT')
 OR has_function_privilege('authenticated','private.farkle_begin_terminal_transfer_v2(uuid,bigint,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','private.farkle_begin_terminal_transfer_v2(uuid,bigint,jsonb,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'commit_boundary:private_boundary'; END IF;
IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE admin_only AND NOT creation_enabled AND NOT production_defaults_approved)
 OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle')
 OR EXISTS(SELECT 1 FROM private.farkle_terminal_transfers_v2)
 THEN RAISE EXCEPTION 'commit_boundary:release_gate'; END IF;
END $verify$;
SELECT jsonb_build_object('commitBoundaryVerified',true,'release',(SELECT to_jsonb(x) FROM private.farkle_release x),'productionDefaults',0,'handoffs',0,'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text)) FROM pg_proc p WHERE p.oid IN ('private.farkle_settle_v1(uuid)'::regprocedure,'public.finalize_gameplay_transfer_batch()'::regprocedure,'private.farkle_begin_terminal_transfer_v2(uuid,bigint,jsonb,jsonb)'::regprocedure,'private.farkle_require_claim_v1(uuid,uuid,uuid)'::regprocedure,'public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)'::regprocedure)));
`;
fs.writeFileSync(dir+'verify.sql',verification);
const proof=read('supabase/farkle/wave2-postgame/post-apply-proof.sql').replace(/^BEGIN;\s*/,'').replace(/ROLLBACK;\s*$/,'');
const recovery=read(dir+'restore-body.sql');const candidate=read(dir+'candidate.sql');
const body='SAVEPOINT legacy_authority_proof;\n'+proof+'\nROLLBACK TO SAVEPOINT legacy_authority_proof;\nRELEASE SAVEPOINT legacy_authority_proof;\n'+recovery+'\n'+candidate+'\n'+verification+'\n'+recovery+'\n'+candidate+'\n'+verification;
fs.writeFileSync('runtime-farkle.local/commit-boundary-preapply.sql','BEGIN;\n'+candidate+'\n'+body+'\nROLLBACK;\n');
fs.writeFileSync('runtime-farkle.local/commit-boundary-postapply.sql','BEGIN;\n'+body+'\nROLLBACK;\n');
console.log('Prepared rollback-safe production verification, two restorations, and metadata assertions.');
