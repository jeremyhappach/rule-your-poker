// Emits a rollback-proof body from legal engine commands (never injected scores).
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
try {
 const e=await vite.ssrLoadModule('/src/lib/run21/engine.ts');
 const {roundDeck}=await vite.ssrLoadModule('/server/run21/harness.ts');
 const {DEFAULT_CONFIG}=await vite.ssrLoadModule('/src/lib/run21/model.ts');
 const {IDENTITY,PLAYERS,uuid}=await vite.ssrLoadModule('/src/lib/run21/fixtures.ts');
 const cases=[];
 for(const [harness,bot,tie,terminal] of [['always_104',false,true,false],['always_105',false,false,true],['always_104',true,false,false],['none',false,false,false]]){
  let at=1000,m=e.createMatch(IDENTITY,PLAYERS.map((p,i)=>({...p,kind:i===1&&bot?'bot':'human'})),5,DEFAULT_CONFIG,at);
  const states=[];let sequence=0;
  const command=(id,intent)=>{const r=m.rounds.at(-1);const result=e.applyCommand(m,{identity:m.identity,roundId:r.id,playerId:id,requestId:randomUUID(),revision:r.boards[id].revision,intent},{kind:'service'},at);assert.equal(result.status,'accepted');m=result.state;};
  for(let n=1;n<=(harness==='none'?1:tie?4:3);n++){
   const id=n===1?uuid(20):randomUUID();m=e.prepareRound(m,id,m.rounds.at(-1)?.id??null,await roundDeck(m.identity,id,harness),at);
   command(m.rounds.at(-1).active_player_id,{type:'ready'});
   if(harness==='none'){states.push(m);break;}
   for(let turn=0;turn<2;turn++){
    const actor=m.rounds.at(-1).active_player_id;
    for(const column of [0,1,2,3,0,1,2,3,4,4,4])command(actor,{type:'place',column});
    if(turn===1&&(!tie||n===4))at+=1000;
    command(actor,{type:'collect'});
    assert.equal(m.rounds.at(-1).boards[actor].result.aggregate,Number(harness.slice(-3)));
    at=m.rounds.at(-1).scorePresentation.endsAt;m=e.advanceScorePresentation(m,at);
   }
   if(m.winnerId)m=e.recordSettlement(m,{...e.settlementIntent(m),resultId:randomUUID(),transferBatchId:randomUUID(),at});
   else for(const player of m.players)command(player.id,{type:'acknowledge'});
   states.push({...structuredClone(m),events:structuredClone(m.events.filter(event=>event.sequence>sequence))});
   sequence=m.eventSequence;
  }
  cases.push({harness,bot,terminal,states});
 }
 const data=JSON.stringify(cases).replaceAll("'","''");
 const proof=readFileSync('supabase/tests/run21/two_human_rollback.sql','utf8').replace("'__ENGINE_STATES__'",`'${data}'`);
 if(process.argv[2])writeFileSync(process.argv[2],proof);else process.stdout.write(proof);
} finally {await vite.close();}
