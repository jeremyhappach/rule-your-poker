import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Link,Routes,Route,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {TooltipProvider} from '@/components/ui/tooltip';
import Delayed,{MatchList} from '@/pages/Delayed';
import {interrupt,allowRetry,loseNextReply,metrics} from './client';
import '@/index.css';
import '@/components/midnight/midnight.css';
function Fixture(){
 const location=useLocation(),[evidence,setEvidence]=useState(metrics());useEffect(()=>{const timer=setInterval(()=>setEvidence(metrics()),250);return()=>clearInterval(timer);},[]);
 return <><aside style={{position:'relative',zIndex:10000,background:'#fff',color:'#000',padding:8,fontSize:13}}>
 <strong>Isolated recovery fixture</strong> <Link to="/delayed">Async lobby</Link> · <Link to="/delayed/new">Setup</Link> · <Link to="/delayed/match">Match</Link> · <Link to="/delayed/match/play/words">Words</Link> · <Link to="/">Leave Async</Link>
 <div><button onClick={()=>interrupt(true)}>Brief interruption</button> · <button onClick={()=>interrupt()}>Block subscription</button> · <button onClick={allowRetry}>Restore transport</button> · <button onClick={loseNextReply}>Lose next action reply</button></div>
 <output>{location.pathname} · sends {evidence.sends} · commits {evidence.commits} · subscriptions {evidence.subscriptions} · revision {evidence.revision}</output></aside>
 <Routes><Route path="/" element={<h1>Live lobby</h1>}/><Route path="/delayed" element={<main className="delayed-page"><h1>Async lobby</h1><MatchList userId="me"/></main>}/><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/></Routes></>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><QueryClientProvider client={new QueryClient()}><VisualPreferencesProvider userId="me"><TooltipProvider><ResponsiveGeometryProvider><Fixture/></ResponsiveGeometryProvider></TooltipProvider></VisualPreferencesProvider></QueryClientProvider></BrowserRouter>);
