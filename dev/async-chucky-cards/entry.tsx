import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import '@/index.css';

// Import the actual Async owner only. Importing Arcade here would hide the
// missing-stylesheet regression by preloading its lazy route's CSS.
const userId='22222222-2222-4222-8222-222222222222';
createRoot(document.getElementById('root')!).render(
 <QueryClientProvider client={new QueryClient()}><TooltipProvider><ResponsiveGeometryProvider><BrowserRouter>
  <DelayedTurn childId="33333333-3333-4333-8333-333333333333" matchId="44444444-4444-4444-8444-444444444444"
   userId={userId} players={[{id:userId,name:'Card visibility fixture'}]}/>
 </BrowserRouter></ResponsiveGeometryProvider></TooltipProvider></QueryClientProvider>
);
