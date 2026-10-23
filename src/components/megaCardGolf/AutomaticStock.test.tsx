// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MegaArcade} from './MegaArcade';
import {MEGA_RULESET,MEGA_SEQUENTIAL_RULESET} from '@/lib/megaCardGolf/config';
import {MegaAuthority,freshStore} from '@/lib/megaCardGolf/authority';
import type {AudioManager} from '@/lib/audio/audioManager';
vi.mock('./MegaCardGolfGame',()=>({MegaCardGolfGame:(p:any)=><div data-testid="game" data-pending={p.view.pending??'back'} data-stage={p.presentation.replacement?.stage??(p.presentation.stockRevealing?'stock-reveal':'idle')}>
 <button disabled={p.busy||p.presentation.locked} onClick={()=>p.onIntent({type:'open',indices:[0]})}>First opening</button>
 <button disabled={p.busy||p.presentation.locked} onClick={()=>p.onIntent({type:'open',indices:[5]})}>Second opening</button>
 <button disabled={p.busy||p.presentation.locked} onClick={()=>p.onIntent({type:'open',indices:[0,5]})}>Open</button>
 <button disabled={p.busy||p.presentation.locked} onClick={()=>p.onIntent({type:'replace',index:1})}>Hidden replacement</button>
 <button disabled={p.busy||p.presentation.locked} onClick={()=>p.onIntent({type:'replace',index:0})}>Face-up replacement</button>
 <button disabled={p.busy||p.presentation.locked} onClick={()=>p.onIntent({type:'discard'})}>Discard</button>
 <button disabled={p.busy||p.presentation.locked} onClick={p.onExit}>Abandon</button>
</div>}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();history.replaceState(null,'','/');});
async function advance(ms:number){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});}
async function click(name:string){await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});}
async function setup({opening=false,pending=false,stock=16,holes=9,sequential=false}={}){
 vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame']});vi.setSystemTime(1000);
 vi.spyOn(document,'hidden','get').mockReturnValue(false);
 const store=freshStore();store.courses[0]={...store.courses[0],enabled:true,stockAllowance:stock,holes};
 const authority=new MegaAuthority(store,()=> 'r',()=>Array.from({length:52},(_,i)=>i),()=>{},sequential?MEGA_SEQUENTIAL_RULESET:MEGA_RULESET);
 authority.start('u',store.courses[0].id,'start',Date.now());
 const perform=(intent:any,id:string)=>{const r=authority.data.runs.r;return authority.action('u','r',id,r.revision,r.hole,intent,Date.now());};
 if(!opening)perform({type:'open',indices:[0,5]},'open');
 if(pending)perform({type:'draw'},'draw');
 const request=vi.fn(async(body:any)=>{
  if(body.op==='catalog')return {courses:authority.data.courses,boards:[],archives:[],active:authority.data.runs.r.status==='active'?'r':null};
  if(body.op==='leaderboard')return {rows:[],self:null,personalBest:null};
  if(body.op==='action')return authority.action('u',body.runId,body.requestId,body.revision,body.hole,body.intent,Date.now());
  return authority.state('u','r',Date.now());
 });
 let changed=()=>{};const subscribe=(_id:string,cb:()=>void)=>{changed=cb;return()=>{};};
 const mount=()=>render(<MegaArcade request={request as any} userId="u" audio={{request:vi.fn(()=>vi.fn())} as unknown as AudioManager} subscribe={subscribe}/>);
 history.replaceState(null,'','/?run=r');const ui=mount();await advance(1);
 return {authority,request,ui,mount,changed:()=>changed(),run:()=>authority.data.runs.r,actions:()=>request.mock.calls.filter(([b])=>b.op==='action').map(([b])=>b)};
}
it('draws once after opening acceptance, preserves allowance, and restores pending cards without consuming another',async()=>{
 const f=await setup({opening:true});expect(f.actions()).toHaveLength(0);
 await click('Open');expect(f.run().draws).toBe(1);expect(f.run().pending).toBe(6);
 expect(screen.getByTestId('game').dataset.stage).toBe('stock-reveal');
 await act(async()=>{f.changed();f.changed();});await advance(500);
 expect(f.actions().filter(b=>b.intent.type==='draw')).toHaveLength(1);
 f.ui.unmount();f.mount();await advance(1);expect(f.run().draws).toBe(1);
 expect(screen.getByTestId('game').dataset.pending).toBe('6');
});
it('keeps next stock concealed through hidden reveal/dissolve/face-up arrival, then draws once',async()=>{
 const f=await setup({pending:true});await click('Hidden replacement');
 expect(f.run().draws).toBe(1);expect(f.run().cards[1]).toBe(6);
 expect(screen.getByTestId('game').dataset.stage).toBe('reveal');
 expect(screen.getByTestId('game').dataset.pending).toBe('back');
 await advance(1550);expect(screen.getByTestId('game').dataset.stage).toBe('dissolve');
 await advance(400);expect(screen.getByTestId('game').dataset.stage).toBe('arrive');
 await click('Face-up replacement');expect(f.actions()).toHaveLength(1);
 expect(f.run().draws).toBe(1);expect(screen.getByTestId('game').dataset.pending).toBe('back');
 await advance(300);expect(f.run().draws).toBe(2);expect(f.run().pending).toBe(7);
 expect(screen.getByTestId('game').dataset.stage).toBe('stock-reveal');
 await advance(400);expect(screen.getByTestId('game').dataset.stage).toBe('idle');
 expect(f.run().discards).toBe(0);
});
it('face-up destinations skip old-card sequence and discard advances exactly one card',async()=>{
 const f=await setup({pending:true});await click('Face-up replacement');
 expect(screen.getByTestId('game').dataset.stage).toBe('arrive');
 await advance(300);expect(f.run().draws).toBe(1);
 await advance(100);expect(f.run().draws).toBe(2);
 await advance(400);await click('Discard');expect(f.run().draws).toBe(3);expect(f.run().discards).toBe(1);
 expect(f.run().pending).toBe(8);
});
it('resolves the final stock before scoring and never draws during final-hole presentation',async()=>{
 const f=await setup({stock:1,holes:1,pending:true});await click('Hidden replacement');
 expect(f.run().status).toBe('completed');expect(f.run().results[0].reason).toBe('stock');
 await advance(16000);expect(f.run().draws).toBe(1);expect(f.actions()).toHaveLength(1);
});
it('does not loop a rejected automatic draw; explicit reconnect permits one fresh attempt',async()=>{
 const f=await setup({opening:true});const original=f.request.getMockImplementation()!;
 let fail=true;f.request.mockImplementation(async body=>{if(body.op==='action'&&body.intent.type==='draw'&&fail)throw Error('offline');return original(body);});
 await click('Open');expect(screen.getByRole('alert').textContent).toContain('offline');
 await act(async()=>{f.changed();});expect(screen.getByRole('alert').textContent).toContain('offline');
 await advance(5000);expect(f.actions().filter(b=>b.intent.type==='draw')).toHaveLength(1);expect(f.run().draws).toBe(0);
 fail=false;await click('Reconnect');expect(f.run().draws).toBe(1);
 expect(f.actions().filter(b=>b.intent.type==='draw')).toHaveLength(2);
});
it('a successful foreground recovery can resume one failed automatic draw',async()=>{
 const f=await setup({opening:true}),original=f.request.getMockImplementation()!;
 let fail=true;f.request.mockImplementation(async body=>{if(body.op==='action'&&body.intent.type==='draw'&&fail)throw Error('offline');return original(body);});
 await click('Open');fail=false;
 await act(async()=>{window.dispatchEvent(new Event('online'));});
 expect(f.run().draws).toBe(1);expect(f.actions().filter(b=>b.intent.type==='draw')).toHaveLength(2);
});
it('a lost accepted draw response restores that card without consuming a second',async()=>{
 const f=await setup({opening:true});const original=f.request.getMockImplementation()!;
 f.request.mockImplementation(async body=>{const result=await original(body);if(body.op==='action'&&body.intent.type==='draw')throw Error('response lost');return result;});
 await click('Open');expect(f.run().draws).toBe(1);expect(screen.getByTestId('game').dataset.pending).toBe('6');
 await click('Reconnect');await advance(500);expect(f.run().draws).toBe(1);
 expect(f.actions().filter(b=>b.intent.type==='draw')).toHaveLength(1);
});
it('does not draw in background, across expiry, or after abandon',async()=>{
 const f=await setup({opening:true});vi.spyOn(document,'hidden','get').mockReturnValue(true);
 await click('Open');expect(f.run().draws).toBe(0);
 vi.setSystemTime(f.run().deadline);vi.spyOn(document,'hidden','get').mockReturnValue(false);
 await act(async()=>{window.dispatchEvent(new Event('focus'));});expect(f.run().phase).toBe('scoring');expect(f.run().draws).toBe(0);
});
it('abandon preserves pending consumption and prevents subsequent automatic draws',async()=>{
 const f=await setup({pending:true});await click('Abandon');await advance(500);
 expect(f.run().status).toBe('abandoned');expect(f.run().draws).toBe(1);expect(f.actions()).toHaveLength(1);
});

it('sequential opening reveals one accepted card and auto-draws only after the second settles',async()=>{
 const f=await setup({opening:true,sequential:true});await click('First opening');
 expect(f.run().phase).toBe('opening');expect(f.run().exposed.filter(Boolean)).toHaveLength(1);expect(f.run().draws).toBe(0);
 await click('Second opening');expect(f.run().exposed.filter(Boolean)).toHaveLength(1);
 await advance(400);await click('Second opening');expect(f.run().phase).toBe('playing');expect(f.run().draws).toBe(0);
 await advance(400);expect(f.run().draws).toBe(1);expect(f.actions().map(b=>b.intent.type)).toEqual(['open','open','draw']);
});
