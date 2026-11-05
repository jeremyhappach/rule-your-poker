import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useParams,Link} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {ReviewGate,ChildResults,MatchFinale} from '@/components/delayed/ResultReview';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {AsyncInvite} from '@/components/delayed/AsyncInvite';
import {actor,delayedRpc} from './transport';
import type {Home} from '@/lib/delayed/client';
import '@/index.css';
import '@/lib/delayed/delayed.css';
function Play(){
 const {matchId,childId}=useParams(),[home,setHome]=useState<Home|null>(null);
 useEffect(()=>{void delayedRpc<Home>('delayed_home',{p_match:matchId}).then(setHome);},[matchId]);
 const props={matchId:matchId!,childId:childId!,userId:actor()};
 return home?<ReviewGate home={home} {...props}>{()=> <DelayedTurn {...props} players={home.players} realMoney={home.realMoney} autoStart/>}</ReviewGate>:<p>Loading match</p>;
}
function HomePage(){
 const {matchId}=useParams(),[home,setHome]=useState<Home|null>(null);
 useEffect(()=>{void delayedRpc<Home>('delayed_home',{p_match:matchId}).then(setHome);},[matchId]);
 return <main className="delayed-page"><h1>Match home</h1>{home?.lineup.map(c=><div key={c.id}><p>{c.terminal?'Complete':c.actor===actor()?'Your turn':'Waiting for opponent'}</p><Link to={'/delayed/'+matchId+'/play/'+c.id}>Open Take 2</Link><Link to={'/review/'+matchId+'/'+c.id}>Review results</Link></div>)}</main>;
}
function Review(){const {matchId,childId}=useParams();return <ChildResults matchId={matchId!} childId={childId!} userId={actor()}/>;}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes>
 <Route path="/delayed/new" element={<AsyncInvite userId={actor()}/>}/>
 <Route path="/delayed/:matchId/play/:childId" element={<Play/>}/>
 <Route path="/delayed/:matchId" element={<HomePage/>}/>
 <Route path="/review/:matchId/:childId" element={<Review/>}/>
 <Route path="*" element={<p>Local qualification</p>}/>
</Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
