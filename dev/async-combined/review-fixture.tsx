import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {ReviewGate,ChildResults,MatchFinale} from '@/components/delayed/ResultReview';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import '@/index.css';
import '@/lib/delayed/delayed.css';
const mode=new URLSearchParams(location.search).get('mode');
const props={childId:'child',matchId:'match',userId:'me'};
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes>
 <Route path='/review' element={mode==='finale'?<MatchFinale matchId='match' userId='me'/>:mode==='child'?<ChildResults {...props}/>:<ReviewGate {...props}>{()=> <DelayedTurn {...props} autoStart/>}</ReviewGate>}/>
 <Route path='/delayed/match' element={<h1>Match home destination</h1>}/>
</Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
