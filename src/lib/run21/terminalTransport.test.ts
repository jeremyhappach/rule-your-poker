// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {createServer} from 'node:http';
import {createRun21Handler} from '../../../server/run21/handler';
const mock=vi.hoisted(()=>({status:undefined as undefined|((s:string)=>void),change:undefined as undefined|(()=>void)}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({
 auth:{getUser:async()=>({data:{user:{id:'00000000-0000-4000-8000-000000000001'}}})},
 rpc:async()=>({data:{allowed:true,record:{game_id:'00000000-0000-4000-8000-000000000001',dealer_game_id:'old',revision:1}}}),
 channel:()=>({on(_type:unknown,_filter:unknown,fn:()=>void){mock.change=fn;return this;},subscribe(fn:(s:string)=>void){mock.status=fn;fn('SUBSCRIBED');return this;}}),
 removeChannel:vi.fn(),removeAllChannels:vi.fn(),
})}));
afterEach(()=>vi.restoreAllMocks());
it.each(['CHANNEL_ERROR','TIMED_OUT','CLOSED'])('closes a previously successful SSE stream on %s so the browser can reconnect',async status=>{
 const runtime=createRun21Handler({url:'https://example.invalid',key:'test'});
 vi.spyOn(runtime.authority,'read').mockResolvedValue({revision:1,eventSequence:1} as never);
 const server=createServer(runtime.handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as {port:number}).port;
 try{
  const token=`e30.${Buffer.from(JSON.stringify({sub:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.sig`;
  const response=await fetch(`http://127.0.0.1:${port}/__run21/00000000-0000-4000-8000-000000000001/events`,{headers:{Authorization:`Bearer ${token}`}});
  expect(response.status).toBe(200);const reader=response.body!.getReader();expect((await reader.read()).done).toBe(false);
  mock.status!(status);expect((await reader.read()).done).toBe(true);
 }finally{runtime.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('streams a committed terminal snapshot even when the database notification is absent',async()=>{
 const runtime=createRun21Handler({url:'https://example.invalid',key:'test'});
 vi.spyOn(runtime.authority,'read').mockResolvedValue({revision:42,eventSequence:108} as never);
 const observe=vi.spyOn(runtime.authority,'observe').mockResolvedValue({revision:43,eventSequence:109,view:{settlement:{resultId:'immutable'}}} as never);
 const server=createServer(runtime.handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as {port:number}).port,game='00000000-0000-4000-8000-000000000001';
 const controller=new AbortController();
 try{
  const token=`e30.${Buffer.from(JSON.stringify({sub:game})).toString('base64url')}.sig`;
  const response=await fetch(`http://127.0.0.1:${port}/__run21/${game}/events?dealerGameId=${game}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
  const reader=response.body!.getReader();await reader.read();
  runtime.authority['notify'](game);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('immutable');
  expect(observe).toHaveBeenCalledWith(game,game,108,game);
 }finally{controller.abort();runtime.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
