// Construct a legal near-final state by replaying the unchanged shared reducer.
// Output is fixture-only SQL; execution is separately scoped to the admitted test.
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createMatch,startHand,execute,project,assertConservation,type Command} from '../../src/lib/canasta/engine';
import {fixtureDeck} from '../../src/lib/canasta/rules';
import {chooseBotAction} from '../../src/lib/canasta/bot';
const fresh=process.argv.includes('--fresh-browser-match');
const f=JSON.parse(readFileSync('qualification.local/canasta/'+(fresh?'browser-match.json':'hosted-live-match.json'),'utf8'));
const first=fresh?f.first:'d85be3df-ab01-44fa-95c2-54757a87a255';
const prefix=fresh?'fresh-final':'final';
assert(first&&(!fresh||Number.isInteger(f.revision)));
let m=createMatch({id:f.dealer,sessionId:f.game,stake:5,realMoney:false,seats:f.players.map((id:string,i:number)=>({id,userId:f.users[i],kind:'human',seat:i===0?4:1}))},0),moves=0,x=1;
let prior=m,command:Command|undefined;
while(!m.winner&&m.completed.length<100){
 const deck=fixtureDeck();for(let i=deck.length-1;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
 m=startHand(m,m.completed.length===0?first:randomUUID(),deck,moves);
 while(m.hand!.phase!=='complete'&&moves<20000){const h=m.hand!,action=chooseBotAction(project(m,h.active));assert(action);
  command={matchId:m.id,handId:h.id,turn:h.turn,generation:h.generation,revision:m.revision,playerId:h.active,requestId:randomUUID(),action};
  prior=m;m=execute(m,command,{kind:'service'},++moves).state;assertConservation(m);
 }
}
assert(m.winner&&command&&prior.hand);prior={...prior,receipts:{},hand:{...prior.hand,deadline:Date.now()+120000},updatedAt:Date.now()};
m=execute(prior,command!,{kind:'service'},Date.now()).state;assert(m.winner);assertConservation(m);
const context={kind:'command',command,userId:prior.seats.find(s=>s.id===command!.playerId)!.userId};
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const base=`SELECT public.canasta_server_commit('${f.dealer}',${prior.revision},${quote(m)},${quote(context)})`;
writeFileSync('qualification.local/canasta/'+prefix+'-prior.sql',`DO $$BEGIN IF NOT EXISTS(SELECT FROM private.canasta_matches WHERE dealer_game_id='${f.dealer}' AND game_id='${f.game}' AND revision=${fresh?f.revision:1} AND settlement IS NULL) THEN RAISE EXCEPTION 'fixture_identity_changed';END IF;
UPDATE private.canasta_matches SET state=${quote(prior)},revision=${prior.revision} WHERE dealer_game_id='${f.dealer}';END$$;`);
writeFileSync('qualification.local/canasta/'+prefix+'-commit.sql',base+';');
const competing={...context,command:{...command,requestId:randomUUID()}};
writeFileSync('qualification.local/canasta/'+prefix+'-competing.sql',`SELECT public.canasta_server_commit('${f.dealer}',${prior.revision},${quote(m)},${quote(competing)});`);
writeFileSync('qualification.local/canasta/'+prefix+'-fixture.json',JSON.stringify({...f,first,revision:prior.revision,moves,completedHands:prior.completed.length,command}));
console.log(JSON.stringify({moves,completedHands:prior.completed.length,revision:prior.revision,conservation:true,winner:m.winner}));
