import {describe,it,expect} from 'vitest';
import {transition,project,type Child} from './adapter';
import {competitionConfig} from '../../src/lib/megaCardGolf/competition';
import {INITIAL_COURSES} from '../../src/lib/megaCardGolf/config';
const rpc=async()=>{throw Error('Mega must not use a second rule core');};
const initial=():Child=>({id:'child',match_id:'match',game_type:'mega-card-golf',config:competitionConfig(INITIAL_COURSES[0],3),starter:'a',actor:'a',organizer:'a',opponent:'b',segment:1,revision:0,terminal:false,available_at:new Date(1000).toISOString(),expires_at:new Date(1000+36*3600e3).toISOString(),state:null,server_at:1000});
describe('Mega async hole adapter',()=>{
 it('plays three holes each with one segment per hole, hidden future decks and lowest-score winner',async()=>{
  let row=initial();
  for(let turn=0;turn<6;turn++){
   const actor=row.actor,start=await transition(row,{type:'start'},rpc);row={...row,state:start.state};
   expect(row.state!.board!.hole).toBe(Math.floor(turn/2)+1);
   const own=await project(row,actor,rpc),other=await project(row,actor==='a'?'b':'a',rpc);
   expect(own.board).not.toHaveProperty('decks');expect(other.board).toBeNull();
   for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}] as const){
    row.server_at+=10;const next=await transition(row,structuredClone(intent),rpc);row.state=next.state;
    if(next.advanced){row.segment++;row.actor=next.state.players[next.state.turn];}
   }
   expect(row.state!.attempts).toHaveLength(turn+1);expect(row.segment).toBe(turn+2);
  }
  expect(row.state!.completed).toBe(true);
  const {totals,winner}=row.state!;expect(winner).toBe(totals.a===totals.b?null:totals.a<totals.b?'a':'b');
  row.terminal=true;const result=await project(row,'a',rpc);expect(JSON.stringify(result)).not.toContain('"decks"');
 });
 it('recovers exactly one expired hole and retains the normal 36-hour forfeit boundary',async()=>{
  let row=initial();row.state=(await transition(row,{type:'start'},rpc)).state;
  row.server_at=Number(row.state.board!.deadline)+1000000;
  const next=await transition(row,{type:'tick'},rpc);expect(next.advanced).toBe(true);expect(next.state.attempts).toHaveLength(1);expect(next.state.board).toBeNull();
  row={...row,state:next.state,actor:'b',server_at:Date.parse(row.expires_at)};
  expect((await transition(row,{type:'tick'},rpc)).forfeit).toBe(true);
 });
});
