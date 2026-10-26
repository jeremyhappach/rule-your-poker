import {RollTimingLab} from './RollTimingLab';
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BrowserRouter,Routes,Route,useParams} from 'react-router-dom';
import {platformAudio} from '@/lib/audio/platformAudio';
import {GameBoard} from '@/pages/Arcade';
import {SoloQuintzee} from '@/components/arcade/SoloQuintzee';
import {QuintzeeTable} from '@/components/quintzee/QuintzeeTable';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {GameChatContextProvider,type GameChatContextValue} from '@/hooks/GameChatContext';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';import '@/lib/arcade/arcade.css';
const f=Object.fromEntries(new URLSearchParams(location.search));f.user??=sessionStorage.getItem('quintzee-local-actor')??'';
platformAudio.install();platformAudio.setUser(f.user);
const audioFollow=platformAudio.follow.bind(platformAudio);(window as any).__quintzeeAudio=[];platformAudio.follow=event=>{(window as any).__quintzeeAudio.push({id:event.id,at:performance.now(),duration:event.expiresAt-event.startedAt});return audioFollow(event);};
function Run(){const {runId}=useParams();return <SoloQuintzee key={runId} runId={runId!} userId={f.user}/>;}
function Table(){const [tab,setTab]=useState<ShellTabId>('cards'),[ended,setEnded]=useState(false);return <GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as unknown as GameChatContextValue}><PersistentTableShell gameId={f.session} gameType="quintzee" presentationMode="fullscreen" header={<div>P-Town Poker</div>}><QuintzeeTable dealerGameId={f.id} userId={f.user} liveEntry activeTab={tab} setActiveTab={setTab} sessionEnded={ended} onTerminalActive={()=>{}} onTerminalComplete={()=>setEnded(true)}/></PersistentTableShell></GameChatContextProvider>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><VisualPreferencesProvider><ResponsiveGeometryProvider><Routes><Route path="/dev/quintzee/production.html" element={f.mode==='pregame'?<GameBoard game="quintzee" userId={f.user}/>:f.mode==='solo'?<SoloQuintzee runId={f.id} userId={f.user}/>:<Table/>}/><Route path="/arcade/quintzee" element={<GameBoard game="quintzee" userId={f.user}/>}/><Route path="/arcade/quintzee/run/:runId" element={<Run/>}/></Routes><RollTimingLab/></ResponsiveGeometryProvider></VisualPreferencesProvider></BrowserRouter>);
