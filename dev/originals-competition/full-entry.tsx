import {useState} from 'react';
import {DealerGamePicker} from '@/components/catalog/DealerGamePicker';
import {useOriginalsAccess} from '@/hooks/useOriginalsAccess';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import Game from '@/pages/Game';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/index.css';
const actor=sessionStorage.getItem('originals-user')!;platformAudio.install();platformAudio.setUser(actor);platformAudio.setPreference(actor,true);
function Choose(){const [selected,setSelected]=useState(''),access=useOriginalsAccess(new URLSearchParams(location.search).get('session')!);return <><DealerGamePicker roster={{players:2,humans:2}} access={access} onSelect={setSelected}/><p>Selected {selected}</p></>;}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes>
 <Route path="/choose" element={<Choose/>}/><Route path="/game/:gameId" element={<Game/>}/><Route path="/" element={<h1>Lobby</h1>}/>
</Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider></QueryClientProvider>);
