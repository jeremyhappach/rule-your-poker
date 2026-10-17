import {expect,it,vi} from 'vitest';
import {TriIntentBuffer,UncertainTriAction,RejectedTriAction,type IntentView,type FrozenIntent} from './intentBuffer';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(){
 let v:IntentView={scope:'round:1',actor:'owner',roundId:'1',revision:1,phase:'playing',waste:0,cards:[1,2,3,4,5],removed:[],allowed:true};
 const stored=new Map<string,string>(),storage={getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,s:string)=>stored.set(k,s),removeItem:(k:string)=>stored.delete(k)} as unknown as Storage;
 const pending:{c:FrozenIntent;resolve:(v:IntentView)=>void;reject:(e:Error)=>void}[]=[];
 const send=vi.fn((c:FrozenIntent)=>new Promise<IntentView>((resolve,reject)=>pending.push({c,resolve,reject})));
 const make=()=>new TriIntentBuffer({key:'test',read:()=>v,send,change:()=>{},storage});const buffer=make();
 const commit=(n:number)=>{const p=pending[n],i=p.c.intent;if(i.type==='remove')v={...v,revision:v.revision+1,waste:v.cards[i.index]!,removed:[...v.removed,i.index]};p.resolve(v);};
 return {buffer,make,send,pending,stored,commit,get v(){return v;},set v(next:IntentView){v=next;}};
}
it('preserves ordered dependencies across the expected upcard changes, assigning confirmed revisions',async()=>{
 const h=harness();[0,1,2,3].forEach(index=>h.buffer.enqueue({type:'remove',index}));expect(h.send).toHaveBeenCalledTimes(1);expect(h.buffer.pendingCards).toEqual([0,1,2,3]);
 for(let i=0;i<4;i++){expect(h.pending[i].c.revision).toBe(i+1);h.commit(i);await flush();}
 expect(h.send.mock.calls.map(([c])=>c.intent)).toEqual([0,1,2,3].map(index=>({type:'remove',index})));expect(h.buffer.busy).toBe(false);
});
it('reports overflow and duplicate taps without retargeting the four retained intentions',()=>{
 const h=harness();[0,1,2,3,4].forEach(index=>h.buffer.enqueue({type:'remove',index}));expect(h.buffer.pendingCards).toEqual([0,1,2,3]);expect(h.buffer.message).toContain('Four plays');
});
it('cancels dependencies on an unexpected confirmed upcard',async()=>{
 const h=harness();h.buffer.enqueue({type:'remove',index:0});h.buffer.enqueue({type:'remove',index:1});h.v={...h.v,waste:99,removed:[0],revision:2};h.pending[0].resolve(h.v);await flush();expect(h.send).toHaveBeenCalledTimes(1);expect(h.buffer.message).toContain('differs');
});
it('lets the server reject a queued action and cancels its dependents explicitly',async()=>{
 const h=harness();[0,1,2].forEach(index=>h.buffer.enqueue({type:'remove',index}));h.commit(0);await flush();h.pending[1].reject(Error('illegal move'));await flush();expect(h.send).toHaveBeenCalledTimes(2);expect(h.buffer.message).toContain('illegal move');expect(h.buffer.busy).toBe(false);
});
it('does not retain intro taps or queue a Ready action behind another Ready action',async()=>{
 const h=harness();h.v={...h.v,phase:'intro'};h.buffer.enqueue({type:'draw'});expect(h.send).not.toHaveBeenCalled();h.v={...h.v,phase:'ready'};h.buffer.enqueue({type:'remove',index:0});h.buffer.enqueue({type:'remove',index:1});expect(h.buffer.pendingCards).toEqual([0]);h.v={...h.v,phase:'playing'};h.commit(0);await flush();expect(h.send).toHaveBeenCalledTimes(1);
});
it('treats a stock draw as a barrier and never invents hidden cards',()=>{
 const h=harness();h.v={...h.v,cards:[null,2]};h.buffer.enqueue({type:'remove',index:0});expect(h.send).not.toHaveBeenCalled();h.buffer.enqueue({type:'draw'});h.buffer.enqueue({type:'remove',index:1});expect(h.send).toHaveBeenCalledTimes(1);expect(h.buffer.queue).toEqual([]);
});
it('persists exactly the sent request, blocks fresh actions, and resolves the identical command after remount',async()=>{
 const h=harness();h.buffer.enqueue({type:'remove',index:0});h.buffer.enqueue({type:'remove',index:1});const first=h.pending[0].c;h.pending[0].reject(new UncertainTriAction('lost'));await flush();expect(h.buffer.uncertain).toBe(true);
 const restored=h.make();restored.restore();restored.enqueue({type:'draw'});expect(h.send).toHaveBeenCalledTimes(1);const resolving=restored.recover();restored.enqueue({type:'draw'});expect(h.send).toHaveBeenCalledTimes(2);expect(h.pending[1].c).toEqual(first);h.commit(1);await resolving;expect(restored.busy).toBe(false);expect(h.stored.size).toBe(0);expect(h.send).toHaveBeenCalledTimes(2);
});
it('retires unsent intentions on disconnect and does not reopen input until the in-flight result arrives',async()=>{
 const h=harness();h.buffer.enqueue({type:'remove',index:0});h.buffer.enqueue({type:'remove',index:1});h.buffer.interrupt();h.buffer.enqueue({type:'remove',index:2});expect(h.buffer.uncertain).toBe(true);h.commit(0);await flush();expect(h.send).toHaveBeenCalledTimes(1);expect(h.buffer.uncertain).toBe(false);expect(h.buffer.message).toContain('Unsent plays were cancelled');
});
it.each(['stage_complete','intro'])('does not carry intentions past a confirmed %s boundary',async phase=>{
 const h=harness();h.buffer.enqueue({type:'remove',index:0});h.buffer.enqueue({type:'remove',index:1});h.v={...h.v,phase,removed:[0],waste:1};h.pending[0].resolve(h.v);await flush();expect(h.send).toHaveBeenCalledTimes(1);expect(h.buffer.busy).toBe(false);
});
it('does not treat an authentication failure during recovery as proof of non-application',async()=>{
 const h=harness();h.buffer.enqueue({type:'remove',index:0});h.pending[0].reject(new UncertainTriAction('lost'));await flush();let recovered=h.buffer.recover();h.pending[1].reject(Error('Sign in again'));await recovered;expect(h.buffer.uncertain).toBe(true);expect(h.stored.size).toBe(1);
 recovered=h.buffer.recover();h.pending[2].reject(new RejectedTriAction('stale revision'));await recovered;expect(h.buffer.busy).toBe(false);expect(h.stored.size).toBe(0);
});
it('does not send a command if its recovery record cannot be retained',()=>{
 const h=harness(),send=vi.fn();const buffer=new TriIntentBuffer({key:'blocked',read:()=>h.v,send,change:()=>{},storage:{getItem:()=>null,setItem:()=>{throw Error('blocked');}} as unknown as Storage});buffer.enqueue({type:'draw'});expect(send).not.toHaveBeenCalled();expect(buffer.message).toContain('Site storage');
});
