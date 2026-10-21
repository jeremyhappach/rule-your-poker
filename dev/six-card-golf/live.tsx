import {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {GolfTable} from '@/components/golf/GolfTable';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {GameChatContextProvider,type GameChatContextValue} from '@/hooks/GameChatContext';
import {useShellTabBar,type ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {platformAudio} from '@/lib/audio/platformAudio';
import {SessionEndedFeltPanel,SessionEndedPaneAction,SessionEndedAnnouncementMount} from '@/components/canonicalShell/SessionEndedTablePhase';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import '@/index.css';
function EndedTable({f,user,tab,setTab,onLobby}:any){
 useShellTabBar({cardsIcon:'spade',activeTab:tab,setActiveTab:setTab,cardsFlashing:null,isPaused:false});
 return <><SessionEndedFeltPanel gameId={f.session} gameType="six-card-golf" currentUserId={user}/><SessionEndedAnnouncementMount gameId={f.session}/><ShellHudGrid timer={null} pane={<span/>} identity={<span>Match complete</span>}/><SessionEndedPaneAction active={tab==='cards'} onBackToLobby={onLobby}/></>;
}
function App(){
 const query=new URLSearchParams(location.search),[f,setF]=useState<any>(query.get('id')?JSON.parse(sessionStorage.getItem('golf-fixture:'+query.get('id'))??'null'):null),[tab,setTab]=useState<ShellTabId>('cards');
 const user=query.get('user')??f?.user;
 const [ended,setEnded]=useState(false),[lobby,setLobby]=useState(false),[checked,setChecked]=useState(!f?.endSession);
 useEffect(()=>{if(!f?.endSession)return;void fetch('/__golf/read',{method:'POST',body:JSON.stringify({table:'games',filters:{id:f.session},single:true})}).then(r=>r.json()).then(v=>{setLobby(v.data?.status==='session_ended');setChecked(true);});},[f?.id]);
 if(lobby)return <main data-local-lobby>Game Lobby</main>;
 if(!checked)return <main>Connecting…</main>;
 const start=async(players:number)=>{const r=await fetch('/__golf/new',{method:'POST',body:JSON.stringify({players})}),v=await r.json();sessionStorage.setItem('golf-fixture:'+v.id,JSON.stringify(v));history.replaceState(null,'','?id='+v.id+'&user='+v.user);platformAudio.setUser(v.user);setF(v);};
 if(!f)return <main><button onClick={()=>void start(2)}>Two humans</button><button onClick={()=>void start(4)}>Four humans</button></main>;
 return <GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as unknown as GameChatContextValue}>
 <PersistentTableShell gameId={f.session} gameType="six-card-golf" presentationMode="table" projectionMode="active-canonical" viewerPosition={f.players.find((p:any)=>p.user===user)?.seat??null} seats={f.players.map((p:any)=>({position:p.seat,occupied:true}))} header={<div>P-Town Poker</div>}>
  {ended?<EndedTable f={f} user={user} tab={tab} setTab={setTab} onLobby={()=>setLobby(true)}/>:<GolfTable dealerGameId={f.id} userId={user} activeTab={tab} setActiveTab={setTab} sessionEnded={false} onTerminalActive={()=>{}} onTerminalComplete={token=>{(window as any).__golfCompleted=token;if(f.endSession)setEnded(true);}}/>}
 </PersistentTableShell></GameChatContextProvider>;
}
const root=createRoot(document.getElementById('root')!);const dispose=platformAudio.install();platformAudio.setUser(new URLSearchParams(location.search).get('user'));
root.render(<VisualPreferencesProvider><ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();dispose();});
