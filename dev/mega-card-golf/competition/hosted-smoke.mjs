import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync as write} from 'node:fs';
import {login,rpc,api,save,sleep,origin,dir} from './hosted-support.mjs';
const phase=process.argv[2]??'closed',a=await login(),f=a.f,e={phase,passed:false,checks:[],live:[],async:[]};
const record=(check)=>{e.checks.push(check);console.log('PASS '+check);};
try{
 const manifest=await fetch(origin+'/build-manifest.json',{headers:{'Cache-Control':'no-cache'}}).then(r=>r.json());assert.equal(manifest.buildId,process.env.MEGA_EXPECTED_SHA??'6a99c7cbd436d7b15e174f7c993f5b213eb0ca4f');e.sha=manifest.buildId;
 const catalog=await rpc(a.clients[0],'mega_competition_catalog',{p_game:f.live[0].id});assert(catalog.enabled);assert.equal(catalog.courses.length,3);
 const config=(course,holes)=>({version:catalog.defaults.version,course:{...catalog.courses[course],holes}});
 const action=async(c,route,v,intent)=>{const command={op:'action',...(route==='mega-golf'?{matchId:v.id,scope:v.scope}:{childId:v.id,segment:v.segment}),revision:v.revision,requestId:randomUUID(),intent};
 const replies=await Promise.all([api(c,route,command),api(c,route,command)]);assert.equal(replies[0].revision,replies[1].revision);assert(!JSON.stringify(replies[0]).includes('"decks"'));return replies[0];};
 async function live(g){
  const c=a.clients[0];
  if(!g.matchId){const args={p_game_id:g.id,p_dealer_player_id:g.players[0].id,p_expected_dealer_position:4,p_game_type:'mega-card-golf',p_config:{ante_amount:5,mega:config(g.course,g.holes)},p_expected_config_deadline:f.deadline};
   const setup=await rpc(c,'mega_configure',args);g.matchId=setup.dealer_game.id;save(f);assert((await rpc(c,'mega_configure',args)).deduped);
   for(const p of g.players.slice(1))await rpc(a.byUser[p.user],'submit_ante_decision',{p_game_id:g.id,p_expected_dealer_game_id:g.matchId,p_player_id:p.id,p_decision:'ante_up'});
   const update=await c.client.from('games').update({pending_session_end:true}).eq('id',g.id);assert(!update.error,update.error?.message);
  }
  let v=await api(c,'mega-golf',{op:'state',matchId:g.matchId}),first;
  await assert.rejects(()=>api(a.clients[3],'mega-golf',{op:'state',matchId:g.matchId}),/participant_required/);
  const read=await a.clients[3].client.from('games').select('id').eq('id',g.id);assert(!read.error);assert.equal(read.data.length,0);
  while(!v.settled){
   if(v.phase!=='playing'){await sleep(v.deadline-Date.now()+120);v=await api(c,'mega-golf',{op:'state',matchId:g.matchId});continue;}
   const actor=a.byUser[g.players.find(p=>p.id===v.actor).user];
   for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}])v=await action(actor,'mega-golf',v,intent);
   first??=v.results.length;
  }
  assert.equal(v.results.length,g.holes*g.players.length);
  for(const p of g.players)assert.equal(v.scores[p.id],v.results.filter(r=>r.actor===p.id).reduce((sum,r)=>sum+r.score,0));
  assert.equal(Object.values(v.financial.balances).reduce((x,y)=>x+y,0),100*g.players.length);
  await sleep(Math.max(v.terminal.deadline,v.deadline)-Date.now()+300);
  v=await api(c,'mega-golf',{op:'state',matchId:g.matchId});assert(v.finished);
  g.completed=true;save(f);e.live.push({game:g.id,match:g.matchId,holes:g.holes,course:g.course,players:g.players.length,scores:v.scores,settlement:v.settlement});record('live '+g.course+'/'+g.holes+' holes: duplicate race, totals, balances, terminal');
 }
 async function invitation(item,prepare=false){
  if(!item.id){const lineup=item.holes.map(holes=>({game:'mega-card-golf',stake:5,config:config(item.course,holes)}));
   const args={p_request:item.request,p_opponent:a.clients[1].id,p_real_money:false,p_lineup:lineup};item.id=await rpc(a.clients[0],'delayed_create',args);assert.equal(await rpc(a.clients[0],'delayed_create',args),item.id);save(f);
   const home=await rpc(a.clients[1],'delayed_home',{p_match:item.id});await rpc(a.clients[1],'delayed_respond',{p_match:item.id,p_request:randomUUID(),p_offer_hash:home.offerHash,p_action:'accept'});
  }
  let home=await rpc(a.clients[0],'delayed_home',{p_match:item.id});item.children=home.lineup.map(c=>c.id);save(f);
  const children=prepare?home.lineup.slice(0,1):home.lineup;
  await Promise.all(children.map(async child=>{
   let v=await api(a.clients[0],'delayed',{op:'state',childId:child.id}),played=0;
   while(!v.terminal){const actor=a.byUser[v.actor],reviews=await rpc(actor,'delayed_reviews',{p_child:child.id});
    for(const event of reviews.events.filter(x=>x.kind==='attempt'&&!x.seen)){await rpc(actor,'delayed_review_begin',{p_event:event.id});await rpc(actor,'delayed_review_ack',{p_event:event.id});await rpc(actor,'delayed_review_ack',{p_event:event.id});}
    v=await api(actor,'delayed',{op:'state',childId:child.id});
    if(!v.board)v=await action(actor,'delayed',v,{type:'start'});
    for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}])v=await action(actor,'delayed',v,intent);
    played++;
    if(prepare){f.replay={match:item.id,child:child.id,viewer:v.actor};save(f);record('hosted invitation, acceptance and first saved opponent hole');return;}
   }
   record('async '+item.course+'/'+child.config.course.holes+' holes: turn/review ACK and duplicate actions');
  }));
  if(!prepare){home=await rpc(a.clients[0],'delayed_home',{p_match:item.id});assert(home.lineup.every(c=>c.terminal));assert.equal(home.status,'settled');item.completed=true;save(f);e.async.push({match:item.id,children:home.lineup.length,net:home.net,receipt:!!home.receipt});}
 }
 if(phase==='replay')await invitation(f.async[0],true);
 else {
  await Promise.all([...f.live.filter(g=>g.phase===phase&&!g.completed).map(live),...f.async.filter(i=>i.phase===phase&&!i.completed).map(i=>invitation(i))]);
 }
 e.passed=true;
}catch(error){e.error=error.message;console.error(error.stack);process.exitCode=1;}
finally{write(dir+'hosted-'+phase+'.json',JSON.stringify(e,null,2));await a.close();}
