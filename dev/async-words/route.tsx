import LivePreview from './live-preview';
import {platformAudio} from '@/lib/audio/platformAudio';
import {supabase} from './route-client';
import {NotificationProvider} from '@/components/delayed/NotificationBell';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import Delayed from '@/pages/Delayed';
import '@/index.css';
platformAudio.install();void supabase.auth.getSession().then(({data})=>platformAudio.setUser(data.session?.user.id??null));
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><NotificationProvider><Routes>
 <Route path="/delayed" element={<Delayed/>}/><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/>
 <Route path="/local-words/:gameId/:dealerId" element={<LivePreview/>}/><Route path="*" element={<p>Local lobby destination</p>}/></Routes></NotificationProvider></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider></QueryClientProvider>);
