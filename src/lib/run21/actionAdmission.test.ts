// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createMatch,prepareRound,applyCommand} from './engine';
import {DEFAULT_CONFIG,type Command} from './model';
import {IDENTITY,PLAYERS,fixtureDeck,uuid} from './fixtures';
import type {StoredMatch} from '../../../server/run21/authority';
const db=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn(),removeAllChannels:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>db}));
import {createRun21Handler} from '../../../server/run21/handler';
const workers:ReturnType<typeof createRun21Handler>[]=[];
afterEach(()=>{workers.splice(0).forEach(w=>w.dispose());vi.resetAllMocks();});
function fixture(){
 const user=uuid(30),now=Date.now();
 let state=prepareRound(createMatch(IDENTITY,PLAYERS,5,DEFAULT_CONFIG,now),uuid(20),null,fixtureDeck([],17),now);
 state=applyCommand(state,{identity:IDENTITY,roundId:uuid(20),playerId:PLAYERS[0].id,requestId:uuid(90),revision:0,intent:{type:'ready'}},{kind:'service'},now).state;
 let row:StoredMatch={dealer_game_id:IDENTITY.dealerGameId,game_id:IDENTITY.sessionId,first_round_id:uuid(20),dealer_user_id:uuid(31),participants:PLAYERS.map((p,i)=>({...p,userId:uuid(30+i),chips:0})),stake:5,balances:{},revision:1,state,bot_due_at:null,finished:false};
 const runtime=createRun21Handler({url:'https://example.invalid',key:'server-only'});workers.push(runtime);runtime.authority.admit(row);
 db.auth.getUser.mockResolvedValue({data:{user:{id:user}},error:null});
 db.rpc.mockImplementation(async(name,args)=>{
  if(name==='run21_server_load_current')return {data:[row],error:null};
  expect(name).toBe('run21_server_commit_admitted');expect(args.p_verified_user_id).toBe(user);
  if(args.p_state)row={...row,revision:row.revision+1,state:args.p_state,bot_due_at:args.p_bot_due_at};
  return {data:{outcome:'committed',record:row},error:null};
 });
 const command=(type:'place'|'pass'):Command=>({identity:IDENTITY,roundId:uuid(20),playerId:PLAYERS[0].id,requestId:crypto.randomUUID(),revision:row.state!.rounds[0].boards[PLAYERS[0].id].revision,intent:type==='pass'?{type}:{type,column:0}});
 const request=async(body:Command)=>{
  const res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  await runtime.handler({url:`/__run21/${IDENTITY.sessionId}/action`,method:'POST',headers:{authorization:'Bearer verified-by-auth'},socket:{},body} as unknown as IncomingMessage,res);
  return {status:vi.mocked(res.writeHead).mock.calls[0][0],body:JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string)};
 };
 return {runtime,user,request,command,get row(){return row;}};
}
it('warm Place and Pass each use fresh Auth and exactly one admission-plus-commit RPC',async()=>{
 const f=fixture();
 for(const type of ['pass','place'] as const){db.rpc.mockClear();const r=await f.request(f.command(type));expect(r.status).toBe(200);expect(r.body.status).toBe('accepted');expect(db.rpc).toHaveBeenCalledTimes(1);expect(db.rpc.mock.calls[0][0]).toBe('run21_server_commit_admitted');}
 expect(db.auth.getUser).toHaveBeenCalledTimes(2);
});
it('does not use caller-supplied user identity or perform a DB request before fresh Auth succeeds',async()=>{
 const f=fixture();db.auth.getUser.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
 expect((await f.request({...f.command('pass'),userId:f.user} as Command)).status).toBe(401);expect(db.rpc).not.toHaveBeenCalled();
});
it('denies a freshly revoked gate even with a cached admitted snapshot',async()=>{
 const f=fixture(),before=structuredClone(f.row);
 db.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'run21:release_denied'}});
 expect((await f.request(f.command('pass'))).status).toBe(403);expect(f.row).toEqual(before);
});
it('duplicate response checks admission without rewriting the accepted action',async()=>{
 const f=fixture(),c=f.command('pass');expect((await f.request(c)).body.status).toBe('accepted');const revision=f.row.revision;
 const duplicate=await f.request(c);expect(duplicate.body.status).toBe('duplicate');expect(f.row.revision).toBe(revision);
 expect(db.rpc).toHaveBeenLastCalledWith('run21_server_commit_admitted',expect.objectContaining({p_verified_user_id:f.user,p_state:null}));
});
it('a revoked duplicate receives no cached private projection',async()=>{
 const f=fixture(),c=f.command('pass');await f.request(c);
 db.rpc.mockImplementation(async(name)=>name==='run21_server_load_current'?{data:[f.row],error:null}:{data:null,error:{code:'42501',message:'run21:release_denied'}});
 const r=await f.request(c);expect(r.status).toBe(403);expect(r.body).toEqual({error:'run21:release_denied'});
});
it('ignores forged user IDs in a valid caller payload',async()=>{
 const f=fixture();const r=await f.request({...f.command('pass'),userId:uuid(999),p_verified_user_id:uuid(999)} as Command);
 expect(r.status).toBe(200);expect(db.rpc).toHaveBeenCalledWith('run21_server_commit_admitted',expect.objectContaining({p_verified_user_id:f.user}));
});
it('cold actions load computation state but never call the standalone admission RPC',async()=>{
 const f=fixture();f.runtime.authority.dispose();
 expect((await f.request(f.command('pass'))).status).toBe(200);
 expect(db.rpc.mock.calls.map(c=>c[0])).toEqual(['run21_server_load_current','run21_server_commit_admitted']);
});
it('a CAS conflict reloads canonical state and retries the same action identity',async()=>{
 const f=fixture();db.rpc.mockResolvedValueOnce({data:{outcome:'conflict'},error:null});
 expect((await f.request(f.command('pass'))).status).toBe(200);
 expect(db.rpc.mock.calls.map(c=>c[0])).toEqual(['run21_server_commit_admitted','run21_server_load_current','run21_server_commit_admitted']);
 expect(f.row.state!.rounds[0].boards[PLAYERS[0].id].passesUsed).toBe(1);
});
