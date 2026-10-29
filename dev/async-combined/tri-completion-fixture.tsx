// Local browser fixture: real adapter, shell and board; synthetic transport only.
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/index.css';
platformAudio.install();platformAudio.setUser('me');
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes>
 <Route path="/turn" element={<DelayedTurn childId="child" matchId="match" userId="me"/>}/>
 <Route path="/delayed/match" element={<h1>Match destination</h1>}/>
</Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
