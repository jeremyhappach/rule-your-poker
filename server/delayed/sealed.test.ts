import {describe,it,expect,vi} from 'vitest';
import {transition,project,initial,type Child,type Rpc} from './adapter';
import {sealedOperation} from './sealed';
import {RUN21_RULES} from '../../src/lib/run21/rulesets';
import {competitionConfig} from '../../src/lib/megaCardGolf/competition';
import {INITIAL_COURSES} from '../../src/lib/megaCardGolf/config';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',now=1800000000000;
const row=():Child=>({id:'00000000-0000-4000-8000-000000000003',match_id:'00000000-0000-4000-8000-000000000004',game_type:'run21',config:structuredClone(RUN21_RULES),starter:a,actor:a,organizer:a,opponent:b,revision:1,partRevision:1,segment:1,sealed:true,terminal:false,available_at:new Date(now).toISOString(),expires_at:new Date(now+72*3600e3).toISOString(),server_at:now,state:null});
const noSql:Rpc=async()=>{throw Error('Unexpected rule RPC');};
describe('independent sealed-round adapters',()=>{
 it.each([a,b])('admits either player and leaves round advancement to SQL: %s',async actor=>{
  const r=row();r.actor=actor;r.state=initial(r);r.state.turn=actor===a?0:1;
  r.state=(await transition(r,{type:'start'},noSql)).state;r.server_at+=2500;
  const next=await transition(r,{type:'collect'},noSql);
  expect(next.advanced).toBe(true);expect(next.state.round).toBe(1);expect(next.state.players[next.state.turn]).toBe(actor);expect(next.state.completed).toBe(false);
  expect(next.state.attempts[0].actor).toBe(actor);
 });
 it('seals an unpaired result even after terminal timeout, then reveals only joined rounds',async()=>{
  const r=row();r.actor=b;r.state=initial(r);r.state.turn=1;r.state.attempts=[{actor:a,round:1,score:100,at:now,board:{result:{score:100}}}];r.state.totals[a]=100;r.terminal=true;
  expect((await project(r,b,noSql)).totals[a]).toBe(0);
  r.state.round=2;expect((await project(r,b,noSql)).totals[a]).toBe(100);
 });
 it('retains Mega private decks and finishes only this player’s hole',async()=>{
  const r=row();r.game_type='mega-card-golf';r.config=competitionConfig(INITIAL_COURSES[0],3);
  r.state=(await transition(r,{type:'start'},noSql)).state;
  for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}] as const){r.server_at+=10;r.state=(await transition(r,structuredClone(intent),noSql)).state;}
  expect(r.state.round).toBe(1);expect(r.state.turn).toBe(0);expect(r.state.attempts).toHaveLength(1);expect(r.state.completed).toBe(false);
  expect(JSON.stringify(await project(r,a,noSql))).not.toContain('"decks"');
 });
 it('retries a peer-only revision conflict without discarding either player',async()=>{
  const r=row(),peer={...r,revision:2,partRevision:1};
  const rpc=vi.fn(async(name:string)=>name==='delayed_sealed_load'?r:name==='delayed_sealed_commit'?{outcome:rpc.mock.calls.filter(([n])=>n==='delayed_sealed_commit').length===1?'conflict':'committed',record:peer}:null);
  const view=await sealedOperation(rpc,a,{op:'action',childId:r.id,revision:1,segment:1,requestId:'request',intent:{type:'start'}});
  expect(view.revision).toBe(2);expect(rpc.mock.calls.filter(([n])=>n==='delayed_sealed_commit')).toHaveLength(2);
 });
 it('rejects stale same-player state instead of retrying it',async()=>{
  const r={...row(),revision:2,partRevision:2};
  const rpc=vi.fn(async()=>r);
  await expect(sealedOperation(rpc,a,{op:'action',childId:r.id,revision:1,segment:1,requestId:'request',intent:{type:'start'}})).rejects.toThrow('stale_action');
  expect(rpc).toHaveBeenCalledTimes(1);
 });
});
