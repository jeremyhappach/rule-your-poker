import {describe,it,expect,vi} from 'vitest';
import {initial,transition,type Child} from './adapter';
import {synchronize} from './service';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
function row():Child&{held:boolean}{return {id:'00000000-0000-4000-8000-000000000003',match_id:'00000000-0000-4000-8000-000000000004',game_type:'quintzee',config:{rounds:2,maxRounds:3},starter:a,actor:a,organizer:a,opponent:b,segment:1,revision:1,terminal:false,held:false,available_at:new Date(0).toISOString(),expires_at:new Date(72*3600000).toISOString(),server_at:72*3600000,state:null};}
describe('Quintzee availability recovery',()=>{
 it('delegates a missed unopened round to SQL without declaring a forfeit',async()=>{
  const r=row(),rpc=vi.fn();const next=await transition(r,{type:'tick'},rpc);
  expect(next.forfeit).toBe(false);expect(next.at).toBe(Date.parse(r.expires_at));expect(next.advanced).toBe(false);expect(rpc).not.toHaveBeenCalled();
 });
 it('keeps a started round playable after the availability boundary',async()=>{
  const r=row();r.state=initial(r);r.state.board={deadline:r.server_at+1000,phase:'playing'};
  const rpc=vi.fn();expect(await synchronize(rpc,r,a)).toBe(r);expect(rpc).not.toHaveBeenCalled();
 });
 it('recovers the persisted playable deadline once without forfeiting later rounds',async()=>{
  const r=row();r.state=initial(r);r.state.board={deadline:r.server_at+1000,phase:'playing'};r.server_at+=1001;
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
   if(name==='delayed_board_core')return {phase:'stage_complete',score:0,deadline:r.server_at-1};
   throw Error('unexpected RPC');
  });
  const next=await transition(r,{type:'tick'},rpc);expect(next.forfeit).toBe(false);expect(next.advanced).toBe(true);expect(next.state.turn).toBe(1);expect(next.state.completed).toBe(false);expect(next.state.attempts[0].score).toBe(0);
 });
});
