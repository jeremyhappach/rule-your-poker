import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {WordsTurn} from '@/components/delayed/WordsTurn';
import '@/index.css';
import '@/lib/delayed/delayed.css';
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter>
 <WordsTurn childId={params.get('child')!} userId={params.get('actor')!} matchId={params.get('match')!}/>
</BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
