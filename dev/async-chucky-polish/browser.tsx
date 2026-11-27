import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {NotificationProvider} from '@/components/delayed/NotificationBell';
import {LobbyBanner} from '@/components/midnight/LobbyBanner';
import Delayed,{MatchList} from '@/pages/Delayed';
import {ChuckyRoundTable} from '@/components/arcade/ChuckyRoundTable';
import {OriginalsBoard} from '@/components/originals/OriginalsBoard';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {supabase} from '@/integrations/supabase/client';
import '@/index.css';
const user='d7dc1928-3727-4351-b0ff-0e80c81c2953';
function Chucky({competitive=false}:{competitive?:boolean}){
 const [v,setV]=useState<any>(),[now,setNow]=useState(1000),[done,setDone]=useState(false),[tab,setTab]=useState<ShellTabId>('cards');
 useEffect(()=>{void supabase.rpc('fixture_chucky_start').then(({data}:any)=>setV(data));(window as any).advance=(at:number)=>setNow(at);},[]);
 const fold=async()=>{const {data}=await supabase.rpc('fixture_chucky_fold');setNow(2000);setV(data);};
 if(done)return <h1>Next screen</h1>;if(!v)return <p>Loading board</p>;
 const common={now,pending:false,ready:true,error:'',recoveryEpoch:0,silent:false,livePhase:v.phase+':'+v.since,choice:null,bornEnded:false,reconnect:()=>{},act:fold,snapshot:v};
 return competitive?<div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><OriginalsBoard game="chucky-showdown" board={v} userId={user} now={now} pending={false} canAct live epoch={0} error="" reconnect={()=>{}} onIntent={fold} activeTab={tab} setActiveTab={setTab} onPresentationDone={()=>setDone(true)}/></div>:<ChuckyRoundTable v={v} userId={user} game={common}/>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><NotificationProvider><Routes>
 <Route path="/fixture/arcade" element={<Chucky/>}/><Route path="/fixture/async" element={<Chucky competitive/>}/>
 <Route path="/arcade/chucky-showdown" element={<h1>Next screen</h1>}/>
 <Route path="/delayed/:matchId" element={<Delayed/>}/>
 <Route path="*" element={<main className="midnight-lobby"><LobbyBanner/><MatchList userId={user}/></main>}/>
</Routes></NotificationProvider></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider></QueryClientProvider>);
