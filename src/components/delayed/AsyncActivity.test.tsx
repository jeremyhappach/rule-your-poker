// @vitest-environment jsdom
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
const mock=vi.hoisted(()=>({homes:[] as any[],rpc:vi.fn(),changed:()=>{},fail:false}));
const badge=vi.hoisted(()=>({sync:vi.fn(),value:undefined as {count:number;version:number}|undefined}));
vi.mock('@/lib/webPush/appBadge',async importOriginal=>({...await importOriginal<typeof import('@/lib/webPush/appBadge')>(),syncAppBadge:badge.sync}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc,channel:()=>{const c={on:(_a:any,_b:any,cb:()=>void)=>{mock.changed=cb;return c;},subscribe:()=>c};return c;},removeChannel(){}}}));
vi.mock('@/components/delayed/AsyncHistory',()=>({AsyncHistory:()=>null}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
import {AsyncActivityProvider,useAsyncActivity} from './AsyncActivity';
import {LobbyBanner} from '@/components/midnight/LobbyBanner';
import {MatchList} from '@/pages/Delayed';
import {delayedRpc} from '@/lib/delayed/client';
import {invalidateAsyncActivity} from '@/lib/delayed/activityUpdates';
const child=(extra={})=>({id:'child',game:'run21',ordinal:1,actor:'other',playable:false,terminal:false,viewed:true,expiresAt:new Date(Date.now()+3600000).toISOString(),...extra});
const home=(id:string,extra={})=>({id,status:'active',revision:1,organizer:'me',opponent:'other',held:false,players:[{id:'me',name:'Me'},{id:'other',name:id}],lineup:[child()],serverAt:Date.now(),receipt:null,...extra});
beforeEach(()=>{badge.sync.mockReset();badge.value=undefined;mock.fail=false;mock.homes=[];mock.rpc.mockReset();mock.rpc.mockImplementation(async(name,args)=>{
 if(name==='delayed_finale_ack'){if(mock.fail)return {error:{message:'Lost ACK'}};mock.homes=mock.homes.filter(h=>h.id!==args.p_match);}
 return {data:{serverAt:Date.now(),matches:mock.homes,badge:badge.value},error:null};
});});afterEach(cleanup);
function Fixture({userId='me'}:{userId?:string}){return <MemoryRouter initialEntries={['/delayed']}><AsyncActivityProvider userId={userId}><LobbyBanner/><MatchList userId={userId}/></AsyncActivityProvider></MemoryRouter>;}
it('forwards the authoritative combined count while keeping the tab match count and preserving failed refreshes',async()=>{
 mock.homes=[home('mixed',{lineup:[child({actor:'me',playable:true}),child({id:'two',actor:'me',playable:true}),child({terminal:true,viewed:false})]})];
 badge.value={count:3,version:100};render(<Fixture/>);
 await screen.findByRole('link',{name:'Async (1)'});await waitFor(()=>expect(badge.sync).toHaveBeenLastCalledWith('me',{count:3,version:100}));
 badge.sync.mockClear();mock.rpc.mockRejectedValueOnce(Error('Offline'));await act(async()=>mock.changed());expect(badge.sync).not.toHaveBeenCalled();
 mock.homes=[];badge.value={count:0,version:200};await act(async()=>invalidateAsyncActivity());
 await waitFor(()=>expect(badge.sync).toHaveBeenLastCalledWith('me',{count:0,version:200}));
});
it('does not clear an existing badge while authentication is unresolved, then clears on confirmed sign-out',async()=>{
 const v=render(<MemoryRouter><AsyncActivityProvider userId={null} authResolved={false}><span/></AsyncActivityProvider></MemoryRouter>);
 expect(badge.sync).not.toHaveBeenCalled();
 v.rerender(<MemoryRouter><AsyncActivityProvider userId={null} authResolved><span/></AsyncActivityProvider></MemoryRouter>);
 await waitFor(()=>expect(badge.sync).toHaveBeenLastCalledWith(null,undefined));
});
it('shows the four waiting matches and both actual finale actions, then reconciles successful ACKs to zero',async()=>{
 mock.homes=[...Array.from({length:4},(_,i)=>home('waiting-'+i)),...['Words mcru81','Chess TheOG'].map(id=>home(id,{status:'settled',receipt:{},reviewsComplete:true,finaleViewed:false,lineup:[child({terminal:true})]}))];
 render(<Fixture/>);const label=await screen.findByRole('link',{name:'Async (2)'});
 expect(label.getAttribute('data-activity')).toBe('true');
 expect(screen.getAllByRole('link',{name:'View Match Result'})).toHaveLength(2);
 expect(document.querySelectorAll('.midnight-match[data-turn=own]')).toHaveLength(2);
 expect(screen.getByRole('link',{name:/vs. Words mcru81/}).getAttribute('href')).toBe('/delayed/Words mcru81');
 mock.fail=true;await act(async()=>{await expect(delayedRpc('delayed_finale_ack',{p_match:'Words mcru81'})).rejects.toThrow('Lost ACK');});
 expect(screen.getByRole('link',{name:'Async (2)'})).toBeTruthy();
 mock.fail=false;await act(async()=>{await delayedRpc('delayed_finale_ack',{p_match:'Words mcru81'});});
 await screen.findByRole('link',{name:'Async (1)'});expect(screen.getAllByRole('link',{name:'View Match Result'})).toHaveLength(1);
 await act(async()=>{await delayedRpc('delayed_finale_ack',{p_match:'Chess TheOG'});});
 expect((await screen.findByRole('link',{name:'Async'})).hasAttribute('data-activity')).toBe(false);
 expect(screen.queryByRole('link',{name:'View Match Result'})).toBeNull();
 expect(document.querySelectorAll('.midnight-match')).toHaveLength(4);
});
it('counts each match once for simultaneous turns and results, and reloads after submission',async()=>{
 mock.homes=[home('mixed',{lineup:[child({actor:'me',playable:true}),child({id:'two',actor:'me',playable:true}),child({id:'done',terminal:true,viewed:false})]})];
 render(<Fixture/>);await screen.findByRole('link',{name:'Async (1)'});
 expect(screen.getByRole('link',{name:'Take Turn'}).getAttribute('href')).toBe('/delayed/mixed');
 expect(screen.getByRole('link',{name:'View Game Result'})).toBeTruthy();
 mock.homes=[home('mixed',{revision:2,lineup:[child({terminal:true,viewed:false})]})];
 await act(async()=>invalidateAsyncActivity());await waitFor(()=>expect(screen.queryByRole('link',{name:'Take Turn'})).toBeNull());
 expect(screen.getByRole('link',{name:'Async (1)'})).toBeTruthy();
 mock.homes=[home('mixed',{revision:3})];await act(async()=>mock.changed());
 await screen.findByRole('link',{name:'Async'});
});
it('rejects an older in-flight list and does not expose the previous account while loading',async()=>{
 mock.homes=[home('work',{lineup:[child({actor:'me',playable:true,untimed:true,expiresAt:null})]})];
 const view=render(<Fixture/>);await screen.findByRole('link',{name:'Async (1)'});
 let old!:(v:any)=>void;mock.rpc.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;}));
 act(()=>mock.changed());mock.homes=[];await act(async()=>mock.changed());await screen.findByRole('link',{name:'Async'});
 await act(async()=>old({data:{serverAt:Date.now(),matches:[home('stale',{lineup:[child({actor:'me',playable:true})]})]}}));
 expect(screen.queryByText('vs. stale')).toBeNull();
 mock.rpc.mockImplementation(()=>new Promise(()=>{}));view.rerender(<Fixture userId="other-user"/>);
 expect(screen.getByRole('link',{name:'Async'})).toBeTruthy();expect(screen.queryByText('vs. work')).toBeNull();
});
