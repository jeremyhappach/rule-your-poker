import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {login,rpc,api,sleep} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/accepted-final.json','utf8')),a=await login(),e={game:f.game,prior:f.dealer,passed:false};
try{
 const db=a.clients[0].client,g=(await db.from('games').select('status,dealer_position,config_deadline').eq('id',f.game).single()).data;assert.equal(g.status,'game_selection');
 const seats=(await db.from('players').select('id,user_id,position').eq('game_id',f.game).in('id',f.players)).data,caller=seats.find(s=>s.position===g.dealer_position),peer=seats.find(s=>s.id!==caller.id);
 const setup=await rpc(a.byUser[caller.user_id],'canasta_configure',{p_game_id:f.game,p_dealer_player_id:caller.id,p_expected_dealer_position:g.dealer_position,p_game_type:'canasta',p_config:{ante_amount:5},p_expected_config_deadline:g.config_deadline}),id=setup.dealer_game.id;assert.notEqual(id,f.dealer);
 assert.notEqual((await api(a.clients[0],id,'state')).status,200);
 await rpc(a.byUser[peer.user_id],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:id,p_player_id:peer.id,p_decision:'ante_up',p_auto_ante:null,p_auto_ante_runback:null});
 let v;for(let i=0;i<50;i++){v=await api(a.clients[0],id,'state');if(v.status===200&&v.body.state.hand)break;await sleep(300);}assert(v.status===200&&v.body.state.hand.number===1);assert.equal(v.body.state.stake,5);
 const actor=a.byUser[f.users[f.players.indexOf(f.command.playerId)]];assert.equal((await api(actor,f.dealer,'action',f.command)).status,200);assert.equal((await api(a.clients[0],id,'state')).body.state.revision,v.body.state.revision);
 write('qualification.local/canasta/browser-match.json',JSON.stringify({...f,dealer:id,first:v.body.firstRoundId,revision:v.body.state.revision}));
 e.match=id;e.freshConsent=true;e.retainedStake=5;e.oldReplayPreservesNewMatch=true;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{await a.close();write('dev/canasta/evidence/hosted-run-back.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
