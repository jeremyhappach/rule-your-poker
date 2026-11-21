import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BrowserRouter,Routes,Route,Link,useNavigate} from 'react-router-dom';
import {UserCircle} from 'lucide-react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LobbyBanner} from '@/components/midnight/LobbyBanner';
import {GameLobby} from '@/components/GameLobby';
import {MatchList} from '@/pages/Delayed';
import {ArcadeSwitchboard} from '@/components/arcade/ArcadeSwitchboard';
import {AsyncInvite} from '@/components/delayed/AsyncInvite';
import {DealerGameSetup} from '@/components/DealerGameSetup';
import {LobbyOnboarding} from '@/components/LobbyOnboarding';
import {NotificationProvider} from '@/components/delayed/NotificationBell';
import {GameDefaultsConfig} from '@/components/GameDefaultsConfig';
import {viewer} from './client';
import '@/index.css';
function Frame({children}:{children:React.ReactNode}){
 const [defaults,setDefaults]=useState(false);
 return <main className="midnight-lobby min-h-screen"><div className="mx-auto space-y-4"><div data-lobby-header className="flex gap-2 items-center"><button className="flex-1 flex justify-between border rounded-lg px-3 py-2"><span>Hap</span><b className="text-red-500">−$89.00</b></button><button className="border rounded-lg p-2" aria-label="Profile Settings"><UserCircle/></button><LobbyOnboarding userId={viewer} ready={false} blocked onDefaults={()=>setDefaults(true)} onRules={()=>{}} onHistory={()=>{}} onLogin={()=>{}} onLogout={()=>{}} onOpenSettings={()=>{}}/></div><LobbyBanner/>{children}<GameDefaultsConfig open={defaults} onOpenChange={setDefaults}/></div></main>;
}
function Setup(){const navigate=useNavigate(),[paused,setPaused]=useState(false);return <DealerGameSetup gameId="preview-table" dealerUsername="Hap" isBot={false} dealerPlayerId={viewer} dealerPosition={1} activePlayerCount={2} activeHumanCount={1} realMoney={false} isFirstHand gameSetupTimerSeconds={600} anteDecisionTimerSeconds={30} configDeadline={new Date(Date.now()+600000).toISOString()} isPaused={paused} onTogglePause={()=>setPaused(v=>!v)} onSessionEnd={()=>navigate('/')} onSitOut={()=>navigate('/')} onConfigComplete={()=>navigate('/')}/>;}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><NotificationProvider><Routes>
 <Route path="/" element={<Frame><GameLobby userId={viewer} isMaintenanceMode={false}/><Link to="/setup">Review Multiplayer picker &amp; setup</Link><p className="text-xs text-slate-400">Local design preview · sample data · no live transactions</p></Frame>}/>
 <Route path="/delayed" element={<Frame><MatchList userId={viewer}/></Frame>}/>
 <Route path="/arcade" element={<Frame><ArcadeSwitchboard userId={viewer} embedded/></Frame>}/>
 <Route path="/delayed/new" element={<main className="delayed-page delayed-match-page"><AsyncInvite userId={viewer}/></main>}/>
 <Route path="/setup" element={<Setup/>}/>
 <Route path="*" element={<Frame><Link to="/">Return to preview lobby</Link></Frame>}/>
 </Routes></NotificationProvider></BrowserRouter></QueryClientProvider>);
