import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {login,api,rpc} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/browser-match.json','utf8')),a=await login();
try{
 const host=a.byUser[f.users[0]],g=(await host.client.from('games').select('is_paused,pause_version').eq('id',f.game).single()).data;
 if(g.is_paused)await rpc(host,'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:f.dealer,p_expected_pause_version:g.pause_version});
 for(const c of a.clients){const v=await api(c,f.dealer,'state');assert.equal(v.status,200);if(v.body.state.automatic.includes(v.body.state.viewer))assert.equal((await api(c,f.dealer,'take-control')).status,200);}
 const v=(await api(host,f.dealer,'state')).body;assert(!v.settlement&&!v.state.pause);
 write('qualification.local/canasta/browser-match.json',JSON.stringify({...f,first:v.firstRoundId,revision:v.state.revision}));console.log(JSON.stringify({match:f.dealer,revision:v.state.revision}));
}finally{await a.close();}
