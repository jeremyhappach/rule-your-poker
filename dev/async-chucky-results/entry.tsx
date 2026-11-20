import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {ReviewGate,ChildResults} from '@/components/delayed/ResultReview';
import '@/index.css';
import '@/lib/delayed/delayed.css';

const home=await fetch('/fixture/home').then(r=>r.json());
const identity={childId:home.lineup[0].id,matchId:home.id,userId:home.organizer};
createRoot(document.getElementById('root')!).render(
 <QueryClientProvider client={new QueryClient()}><TooltipProvider><ResponsiveGeometryProvider><BrowserRouter>
  {home.lineup[0].terminal?<ChildResults {...identity}/>:<ReviewGate {...identity} home={home}>{()=> <h1>Your gameplay</h1>}</ReviewGate>}
 </BrowserRouter></ResponsiveGeometryProvider></TooltipProvider></QueryClientProvider>
);
