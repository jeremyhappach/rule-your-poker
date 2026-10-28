/** Child-process entry for the isolated recovery proof. Never imported by production. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {recoverCanasta} from '../../server/canasta/recovery';
import {createMatch,startHand,assertConservation,type Match} from '../../src/lib/canasta/engine';
import {fixtureDeck} from '../../src/lib/canasta/rules';
const docker=path.join(process.env.LOCALAPPDATA!,'Programs/DockerDesktop/resources/bin/docker.exe');
const container='canasta-integration-proof-20261021',db='canasta_recovery_proof';
if(execFileSync(docker,['inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim()!=='none')throw Error('isolated proof only');
const sql=(q:string)=>execFileSync(docker,['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-Atq'],{input:q,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
const literal=(v:unknown)=>v===null?'NULL':"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
if(process.argv[2]==='seed'){
 const f=JSON.parse(sql('SET ROLE postgres; SELECT private.canasta_concurrency_fixture(false);'));
 const raw=JSON.parse(sql(`SELECT state FROM private.canasta_matches WHERE dealer_game_id=${literal(f.match)};`)) as Match;
 const at=Date.now()-130000;
 const m=startHand(createMatch({id:raw.id,sessionId:raw.sessionId,stake:10,realMoney:false,seats:raw.seats},at),f.round,fixtureDeck(),at);
 sql(`UPDATE private.canasta_matches SET state=${literal(m)}::jsonb,revision=${m.revision} WHERE dealer_game_id=${literal(f.match)};`);
 console.log(JSON.stringify(f));
}else{
 const rpc=async<T>(name:string,args:Record<string,unknown>):Promise<T>=>{
  const order:Record<string,string[]>={canasta_recovery_claim:['p_token'],canasta_recovery_load:['p_token','p_match'],canasta_server_commit:['p_match','p_revision','p_state','p_context'],canasta_server_finish:['p_match'],canasta_recovery_complete:['p_token','p_failure']};
  if(!order[name])throw Error('unsupported proof RPC');
  const response=sql(`SELECT public.${name}(${order[name].map(k=>literal(args[k])).join(',')});`);
  if(name==='canasta_server_commit'&&process.env.CANASTA_PROOF_CRASH==='commit')process.exit(23);
  if(name==='canasta_server_finish'&&process.env.CANASTA_PROOF_CRASH==='finish')process.exit(24);
  const value=response?JSON.parse(response):null;
  if(name==='canasta_server_commit')assertConservation(value.state);
  return value as T;
 };
 recoverCanasta(rpc,process.argv[2]).then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
