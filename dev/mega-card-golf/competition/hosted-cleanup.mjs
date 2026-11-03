// Caller supplies only DB-verified allowlisted fake parent IDs. Canonical removal preserves audit.
import {randomUUID} from 'node:crypto';
import {login,rpc,dir} from './hosted-support.mjs';
import {writeFileSync as write} from 'node:fs';
const a=await login(),removed=[];
try{for(const id of process.argv.slice(2)){
 if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Expected exact UUID');
 const home=await rpc(a.clients[0],'delayed_home',{p_match:id});
 if(!home.lineup.every(c=>c.game==='mega-card-golf'||c.gameType==='mega-card-golf'||c.game_type==='mega-card-golf'))throw Error('Only Mega qualification matches may be removed');
 const request=randomUUID(),args={p_match:id,p_request:request};
 const receipt=await rpc(a.clients[0],'delayed_remove',args);await rpc(a.clients[0],'delayed_remove',args);removed.push(receipt);
}}finally{await a.close();write(dir+'hosted-cleanup.json',JSON.stringify({removed},null,2));console.log(JSON.stringify({removed:removed.length}));}
