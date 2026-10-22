import {describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
const mocks=vi.hoisted(()=>({action:vi.fn(async()=>({accepted:true})),auth:vi.fn(async()=>({data:{user:{id:'actor'}},error:null}))}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:mocks.auth}})}));
vi.mock('../../../server/canasta/store.js',()=>({createStore:()=>({})}));
vi.mock('../../../server/canasta/authority.js',()=>({CanastaAuthority:class{action=mocks.action;}}));
import {createCanastaHandler} from '../../../server/canasta/handler';
const command={playerId:'player',action:{type:'draw'}};
async function request(body:unknown,chunks:string[]=[]){
 const req=Object.assign(Readable.from(chunks),{url:'/__canasta/10000000-0000-4000-8000-000000000001/action',method:'POST',headers:{authorization:'Bearer fixture'},...(body===undefined?{}:{body})});
 const res={writeHead:vi.fn(),end:vi.fn()};mocks.action.mockClear();
 await createCanastaHandler('fixture','fixture').handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);return res;
}
describe('hosted request body transport',()=>{
 it.each([command,JSON.stringify(command)])('accepts host-parsed bodies without rereading the consumed stream',async body=>{
  const r=await request(body);expect(r.writeHead).toHaveBeenCalledWith(200,expect.anything());expect(mocks.action).toHaveBeenCalledWith(expect.any(String),'actor',command);
 });
 it('retains raw-stream handling',async()=>{const r=await request(undefined,[JSON.stringify(command)]);expect(r.writeHead).toHaveBeenCalledWith(200,expect.anything());});
 it.each(['x'.repeat(16385),{...command,padding:'x'.repeat(16385)}])('rejects oversized host-parsed bodies before authority',async body=>{
  const r=await request(body);expect(r.writeHead).toHaveBeenCalledWith(413,expect.anything());expect(mocks.action).not.toHaveBeenCalled();
 });
});
