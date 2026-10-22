// Validate reviewed result artifacts offline. Does not connect or execute SQL.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationHash} from './production-proof.mjs';
export function validateEvidence(manifest,evidence){
 if(manifest.migrationHash!==migrationHash||manifest.units?.length!==22)throw Error('Wrong migration/manifest');
 const expected=['core','financial','recovery','qualification',...['human','mixed','continuation'].flatMap(kind=>['fake','real'].flatMap(m=>[2,3,4].map(n=>`${kind}-${m}-${n}`)))].sort();
 if(JSON.stringify(manifest.units.map(u=>u.name).sort())!==JSON.stringify(expected))throw Error('Wrong proof coverage');
 if(!Array.isArray(evidence.units)||evidence.units.length!==22)throw Error('All twenty-two unit results required');
 const seen=new Set();let canonical,catalog,botFinishes=0;
 for(const unit of manifest.units){
  const rows=evidence.units.filter(x=>x.candidate_evidence?.unit===unit.name);
  if(rows.length!==1)throw Error(`Missing/duplicate unit: ${unit.name}`);
  const {candidate_evidence:a,rollback_evidence:b,sql_sha256:hash}=rows[0];
  if(hash!==unit.sha256||a.fixture_namespace!==unit.namespace||b?.unit!==unit.name||b.fixture_namespace!==unit.namespace||b.rollback_verified!==true||a.existing_records_unchanged!==true||b.golf_release_exists!==manifest.installed)throw Error(`Unverified unit: ${unit.name}`);
  if(!a.function_fingerprints||Object.keys(a.function_fingerprints).length<20)throw Error('Missing authority fingerprints');
  const sorted=JSON.stringify(Object.entries(a.function_fingerprints).sort(([a],[b])=>a.localeCompare(b)));
  if(canonical&&canonical!==sorted)throw Error('Authority differs across units');canonical=sorted;
  if(!/^[a-f0-9]{32}$/.test(a.catalog_fingerprint??''))throw Error('Missing catalog fingerprint');
  if(catalog&&catalog!==a.catalog_fingerprint)throw Error('Catalog differs across units');catalog=a.catalog_fingerprint;
  if(unit.name.startsWith('mixed')){
   const n=a.metrics?.bot_finishes;if(!Number.isInteger(n)||n<0)throw Error('Missing actual bot-finish count');botFinishes+=n;
  }
  seen.add(unit.name);
 }
 if(botFinishes<1)throw Error('No earned bot final settlement observed; mixed coverage incomplete');
 return {function_fingerprints:Object.fromEntries(JSON.parse(canonical)),catalog_fingerprint:catalog,migrationHash,units:seen.size,botFinishes,installed:manifest.installed,scope:'rollback SQL authority only; not live-service qualification'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==5)throw Error('Usage: node dev/six-card-golf/production-evidence.mjs manifest.json evidence.json reviewed-fingerprints.json');
 const result=validateEvidence(JSON.parse(readFileSync(process.argv[2],'utf8')),JSON.parse(readFileSync(process.argv[3],'utf8')));
 writeFileSync(process.argv[4],JSON.stringify(result,null,2));console.log(JSON.stringify({units:result.units,botFinishes:result.botFinishes,scope:result.scope}));
}
