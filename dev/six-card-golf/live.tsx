import {useState} from 'react';import {createRoot} from 'react-dom/client';
import {GolfTable} from '@/components/golf/GolfTable';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {GameChatContextProvider,type GameChatContextValue} from '@/hooks/GameChatContext';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/index.css';
function App(){
 const query=new URLSearchParams(location.search),[f,setF]=useState<any>(query.get('id')?JSON.parse(sessionStorage.getItem('golf-fixture:'+query.get('id'))??'null'):null),[tab,setTab]=useState<ShellTabId>('cards');
 const user=query.get('user')??f?.user;
 const start=async(players:number)=>{const r=await fetch('/__golf/new',{method:'POST',body:JSON.stringify({players})}),v=await r.json();sessionStorage.setItem('golf-fixture:'+v.id,JSON.stringify(v));history.replaceState(null,'','?id='+v.id+'&user='+v.user);platformAudio.setUser(v.user);setF(v);};
 if(!f)return <main><button onClick={()=>void start(2)}>Two humans</button><button onClick={()=>void start(4)}>Four humans</button></main>;
 return <GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as unknown as GameChatContextValue}>
 <PersistentTableShell gameId={f.session} gameType="six-card-golf" presentationMode="table" projectionMode="active-canonical" viewerPosition={f.players.find((p:any)=>p.user===user)?.seat??null} seats={f.players.map((p:any)=>({position:p.seat,occupied:true}))} header={<div>P-Town Poker</div>}>
  <GolfTable dealerGameId={f.id} userId={user} activeTab={tab} setActiveTab={setTab} sessionEnded={false} onTerminalActive={()=>{}} onTerminalComplete={token=>{(window as any).__golfCompleted=token;}}/>
 </PersistentTableShell></GameChatContextProvider>;
}
const root=createRoot(document.getElementById('root')!);const dispose=platformAudio.install();platformAudio.setUser(new URLSearchParams(location.search).get('user'));
root.render(<VisualPreferencesProvider><ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();dispose();});
