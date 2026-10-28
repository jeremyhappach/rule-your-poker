import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {login,rpc,api} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/browser-match.json','utf8')),a=await login();
try{
 const c=a.byUser[f.users[0]],g=(await c.client.from('games').select('is_paused,pause_version').eq('id',f.game).single()).data;
 assert(g.is_paused);await rpc(c,'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:f.dealer,p_expected_pause_version:g.pause_version});
 const v=(await api(c,f.dealer,'state')).body;assert(v.state.hand&&!v.state.pause&&!v.settlement);
 const e={game:f.game,match:f.dealer,revision:v.state.revision,deadline:v.state.hand.deadline,active:v.state.hand.active,turn:v.state.hand.turn,clientsClosedAt:Date.now()};
 write('qualification.local/canasta/recovery-start.json',JSON.stringify(e));console.log(JSON.stringify(e));
}finally{await a.close();}
