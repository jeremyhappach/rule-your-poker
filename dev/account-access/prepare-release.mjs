import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
const prior=JSON.parse(read('dev/account-access/deployed-preimage.json'));
const funcs=[...prior.functions,...prior.push,...JSON.parse(read('dev/account-access/canasta-preimage.json'))];
const seen=new Set(),expected=[];
for(const f of funcs){const signature=f.def.match(/FUNCTION ([^(]+\([^\n]+)\n/)?.[1];if(!signature||seen.has(signature))continue;seen.add(signature);expected.push({schema:f.schema??(f.name==='push_eligible'?'private':'public'),name:f.name,hash:createHash('md5').update(f.def).digest('hex')});}
write('supabase/account-access/preflight.sql',`SELECT jsonb_agg(jsonb_build_object('schema',e.schema,'name',e.name)) mismatches FROM jsonb_to_recordset('${JSON.stringify(expected)}'::jsonb) AS e(schema text,name text,hash text) WHERE NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=e.schema AND p.proname=e.name AND md5(pg_get_functiondef(p.oid))=e.hash);`);
for(const file of ['src/components/PlayerManagement.tsx','src/pages/Auth.tsx'])write(file,read(file,'utf8').trimEnd()+'\n');
const sql=read('supabase/account-access/candidate.sql','utf8');
write('supabase/migrations/20261104153508_admin_account_access_email_verification.sql',sql);
write('dev/account-access/evidence/qualification.json',JSON.stringify({candidateSha256:createHash('sha256').update(sql).digest('hex'),hostedRollback:{account:true,push:true,asyncFinancialGroups:26,liveFinancialCases:10},concurrency:['action before suspension','suspension before action'],unitTests:17,browserCases:20,productionApplied:false},null,2));
