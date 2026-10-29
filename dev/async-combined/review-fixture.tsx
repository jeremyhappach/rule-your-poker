import Delayed from '@/pages/Delayed';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {ReviewGate,ChildResults,MatchFinale} from '@/components/delayed/ResultReview';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {AsyncHistory} from '@/components/delayed/AsyncHistory';
import '@/index.css';
import '@/lib/delayed/delayed.css';
const mode=new URLSearchParams(location.search).get('mode'),preview=!!(window as any).__REVIEW_PREVIEW__;
const props={childId:'child',matchId:'match',userId:'me'};
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes>
 <Route path='/review' element={mode==='finale'?<MatchFinale matchId='match' userId='me'/>:mode==='child'?<ChildResults {...props}/>:<ReviewGate {...props}>{()=> <DelayedTurn {...props} autoStart/>}</ReviewGate>}/>
 <Route path='/delayed' element={<Delayed/>}/><Route path='/delayed/:matchId' element={preview||mode==='home'||mode==='list'?<Delayed/>:<h1>Match home destination</h1>}/>
 <Route path='/delayed/:matchId/play/:childId' element={<Delayed/>}/>
 <Route path='/completed' element={<main className="delayed-page delayed-match-page"><h1>Completed Sessions</h1><AsyncHistory viewerName="Hap"/></main>}/>
 <Route path='/' element={<main className="delayed-page delayed-match-page"><h1>Completed Sessions</h1><AsyncHistory viewerName="Hap"/></main>}/>
{preview&&<Route path='*' element={<main className='delayed-page'><h1>Local review preview</h1><p>This preview covers match home, history and finales. Gameplay and account changes are not connected.</p><a href='/'>Back to preview menu</a></main>}/>}</Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
