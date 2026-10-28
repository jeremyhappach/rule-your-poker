import {describe,it,expect} from 'vitest';
import {initial,transition,project,gameplayDue,type Child,type State,type Rpc} from './adapter';
import {RUN21_RULES} from '../../src/lib/run21/rulesets';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const now=1800000000000;
function child():Child{return {id:'00000000-0000-4000-8000-000000000003',match_id:'00000000-0000-4000-8000-000000000004',
 game_type:'run21',config:structuredClone(RUN21_RULES),starter:a,actor:a,organizer:a,opponent:b,segment:1,revision:1,terminal:false,
 available_at:new Date(now).toISOString(),expires_at:new Date(now+36*3600000).toISOString(),server_at:now,state:null};}
const noSql:Rpc=async()=>{throw Error('unexpected SQL');};
function advance(row:Child,state:State,at:number){return {...row,state,actor:state.players[state.turn],revision:row.revision+1,segment:row.segment+1,
 available_at:new Date(at).toISOString(),expires_at:new Date(at+36*3600000).toISOString(),server_at:at};}
describe('delayed scheduling with shared board authority',()=>{
 it('reads a forfeiture winner and signed result from the immutable outcome',async()=>{
  const row=child();row.state=initial(row);row.terminal=true;
  row.outcome={winner:b,reason:'timeout_forfeit',organizer_delta:-7,opponent_delta:7};
  const view=await project(row,a,noSql);expect(view.winner).toBe(b);expect(view.result).toEqual({winner:b,reason:'timeout_forfeit',delta:-7});
 });
 it('starts only one attempt without extending availability',async()=>{
  const row=child(),result=await transition(row,{type:'start'},noSql);
  expect(result.advanced).toBe(false);expect(row.state).toBeNull();expect(result.state.board?.startedAt).toBe(now+2500);
  expect(result.state.deck?.cards).toHaveLength(52);expect(result.state.deck?.commitment).toMatch(/^[0-9a-f]{64}$/);
  expect(row.expires_at).toBe(new Date(now+36*3600000).toISOString());
 });
 it('keeps the other player private and never returns future cards or salt',async()=>{
  const row=child();row.state=(await transition(row,{type:'start'},noSql)).state;
  const own=await project(row,a,noSql),other=await project(row,b,noSql);
  expect(own.board).not.toBeNull();expect(other.board).toBeNull();
  expect(JSON.stringify(own)).not.toContain(row.state.deck!.salt);
  expect(JSON.stringify(own)).not.toContain('commitment');expect(JSON.stringify(own)).not.toContain('"deck"');
 });
 it('rejects illegal input and shared intro actions',async()=>{
  const row=child();row.state=(await transition(row,{type:'start'},noSql)).state;
  await expect(transition(row,{type:'place',column:0},noSql)).rejects.toThrow('round_intro');
  row.server_at+=2500;
  await expect(transition(row,{type:'place',column:5},noSql)).rejects.toThrow('column_locked');
 });
 it('hands off after a completed segment, retaining the frozen starter next round',async()=>{
  let row=child();row.state=(await transition(row,{type:'start'},noSql)).state;row.server_at+=2500;
  const first=await transition(row,{type:'collect'},noSql);
  expect(first.state.attempts).toHaveLength(1);expect(first.state.players[first.state.turn]).toBe(b);expect(first.state.board).toBeNull();
  row=advance(row,first.state,row.server_at);row.state=(await transition(row,{type:'start'},noSql)).state;row.server_at+=2500;
  const second=await transition(row,{type:'collect'},noSql);
  expect(second.state.round).toBe(2);expect(second.state.players[second.state.turn]).toBe(a);
 });
 it('preserves competitive Run21 tie continuation after three rounds',async()=>{
  let row=child();
  for(let i=0;i<6;i++){
   row.state=(await transition(row,{type:'start'},noSql)).state;row.server_at+=2500;
   const next=await transition(row,{type:'collect'},noSql);row=advance(row,next.state,row.server_at);
  }
  expect(row.state?.completed).toBe(false);expect(row.state?.round).toBe(4);expect(row.state?.attempts).toHaveLength(6);
 });
 it('resolves an earlier gameplay timeout at its original timestamp',async()=>{
  const row=child();row.state=(await transition(row,{type:'start'},noSql)).state;
  const due=gameplayDue(row.state)!;row.server_at=Date.parse(row.expires_at)+1000;
  const next=await transition(row,{type:'tick'},noSql);
  expect(next.forfeit).toBe(false);expect(next.at).toBe(due);expect(next.advanced).toBe(true);
  expect(next.state.attempts[0].board.result?.reason).toBe('timeout');expect(next.state.totals[a]).toBe(0);
 });
 it('forfeits at availability expiry even if the player started just before it',async()=>{
  const row=child();row.server_at=Date.parse(row.expires_at)-1;row.state=(await transition(row,{type:'start'},noSql)).state;
  row.server_at=Date.parse(row.expires_at);
  expect((await transition(row,{type:'tick'},noSql)).forfeit).toBe(true);
 });
 it('hides an unpaired opponent score until paired or terminal',async()=>{
  const row=child();row.state=initial(row);row.state.attempts=[{actor:a,round:1,score:100,at:now,board:{result:{score:100}}}];
  row.state.totals[a]=100;row.actor=b;row.state.turn=1;
  expect((await project(row,b,noSql)).totals[a]).toBe(0);
  row.terminal=true;expect((await project(row,b,noSql)).totals[a]).toBe(100);
 });
});
