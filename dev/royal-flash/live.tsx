import {useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import type {RoyalTransport} from '@/hooks/useRoyalFlash';
import {arcadeSnapshot,multiplayerSnapshot} from '@/lib/royalFlash/model';
import {RoyalFlashGame} from '@/components/royalFlash/RoyalFlashGame';
import {RoyalFlashTable} from '@/components/royalFlash/RoyalFlashTable';
import {GameChatContextProvider,type GameChatContextValue} from '@/hooks/GameChatContext';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/index.css';
import '@/lib/arcade/arcade.css';
async function request(path:string,body:unknown){const r=await fetch('/__royal/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
function App(){
 const initial=Object.fromEntries(new URLSearchParams(location.search)),[fixture,setFixture]=useState<any>(initial.id?initial:null),[error,setError]=useState(''),[leaderboard,setLeaderboard]=useState<any>(null);
 const start=async(solo:boolean)=>{try{const f=await request('new',{solo});platformAudio.setUser(f.user);setFixture({...f,live:true});setLeaderboard(null);history.replaceState(null,'',`?${new URLSearchParams({id:f.id,user:f.user,mode:f.mode,session:f.session??''})}`);}catch(e){setError((e as Error).message);}};
 if(fixture)return <Live key={fixture.id+fixture.user} fixture={fixture} onDone={async()=>{if(fixture.mode==='solo')setLeaderboard(await request('leaderboard',{user:fixture.user}));else await request('close',fixture);setFixture(null);history.replaceState(null,'',location.pathname);}}/>;
 return <main className="arcade-page"><h1>Royal Flash</h1><p>Local first playable · approved P-Town rules</p><div className="arcade-tabs"><button onClick={()=>void start(true)}>Start solo Arcade</button><button onClick={()=>void start(false)}>Start two-player table</button></div>{error&&<p role="alert">{error}</p>}{leaderboard&&<><h2>Royal Flash leaderboard</h2>{leaderboard.rows.map((r:any)=><p key={r.runId}>#{r.rank} · {r.name} · {r.score.toLocaleString()}</p>)}</>}</main>;
}
function Live({fixture:f,onDone}:{fixture:any;onDone:()=>Promise<void>}){
 const solo=f.mode==='solo';const [tab,setTab]=useState<ShellTabId>('cards');
 const transport=useMemo<RoyalTransport>(()=>({
  load:async()=>{const v=await request('state',f);return solo?arcadeSnapshot(v,f.user):multiplayerSnapshot(v);},
  send:async command=>{const v=await request('action',{...f,command});return solo?arcadeSnapshot(v,f.user):multiplayerSnapshot(v);},
  subscribe:(refresh,status)=>{const stream=new EventSource(`/__royal/events?id=${f.id}`);stream.onmessage=()=>refresh();stream.onopen=()=>{status(true);refresh();};stream.onerror=()=>status(false);return()=>stream.close();},
 }),[f,solo]);
 const child=solo?<RoyalFlashGame id={f.id} userId={f.user} solo transport={transport} liveEntry={!!f.live} onComplete={()=>void onDone()}/>:<GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as unknown as GameChatContextValue}><RoyalFlashTable dealerGameId={f.id} userId={f.user} liveEntry={!!f.live} activeTab={tab} setActiveTab={setTab} sessionEnded={false} onTerminalActive={()=>{}} onTerminalComplete={()=>{(window as any).__royalCompleted=f;void onDone();}}/></GameChatContextProvider>;
 return <>{!solo&&f.watcher&&<a style={{position:'fixed',left:8,bottom:0,zIndex:100,fontSize:12}} href={`?${new URLSearchParams({id:f.id,user:f.watcher,mode:f.mode,session:f.session})}`} target="_blank" rel="noreferrer">Open spectator</a>}{!solo&&f.other&&<a style={{position:'fixed',right:8,bottom:0,zIndex:100,fontSize:12}} href={`?${new URLSearchParams({id:f.id,user:f.other,mode:f.mode,session:f.session})}`} target="_blank" rel="noreferrer">Open player two</a>}{solo?child:<PersistentTableShell gameId={f.session} gameType="royal-flash" presentationMode="fullscreen" header={<div>P-Town Poker · App header</div>}>{child}</PersistentTableShell>}</>;
}
const root=createRoot(document.getElementById('root')!);
const disposeAudio=platformAudio.install();platformAudio.setUser(new URLSearchParams(location.search).get('user'));
root.render(<VisualPreferencesProvider><ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();disposeAudio();});
