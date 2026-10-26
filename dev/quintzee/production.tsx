import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {SoloQuintzee} from '@/components/arcade/SoloQuintzee';
import {QuintzeeTable} from '@/components/quintzee/QuintzeeTable';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {GameChatContextProvider,type GameChatContextValue} from '@/hooks/GameChatContext';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';import '@/lib/arcade/arcade.css';
import {arcadeRequest} from '@/lib/arcade/client';
function Leaderboard(){const [board,setBoard]=useState<any>(null);useEffect(()=>{void arcadeRequest({op:'leaderboard',game:'quintzee',window:'all'}).then(setBoard);},[]);return <main><h1>Quintzee leaderboard</h1>{board?<pre data-leaderboard>{JSON.stringify(board)}</pre>:<p>Loading</p>}</main>;}
const f=Object.fromEntries(new URLSearchParams(location.search));
function Table(){const [tab,setTab]=useState<ShellTabId>('cards'),[ended,setEnded]=useState(false);return <GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as unknown as GameChatContextValue}><PersistentTableShell gameId={f.session} gameType="quintzee" presentationMode="fullscreen" header={<div>P-Town Poker</div>}><QuintzeeTable dealerGameId={f.id} userId={f.user} liveEntry activeTab={tab} setActiveTab={setTab} sessionEnded={ended} onTerminalActive={()=>{}} onTerminalComplete={()=>setEnded(true)}/></PersistentTableShell></GameChatContextProvider>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><VisualPreferencesProvider><ResponsiveGeometryProvider><Routes><Route path="/dev/quintzee/production.html" element={f.mode==='solo'?<SoloQuintzee runId={f.id} userId={f.user}/>:<Table/>}/><Route path="/arcade/quintzee" element={<Leaderboard/>}/></Routes></ResponsiveGeometryProvider></VisualPreferencesProvider></BrowserRouter>);
