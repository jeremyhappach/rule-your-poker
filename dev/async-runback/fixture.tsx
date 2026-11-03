import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Link,useLocation} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {AsyncHistory} from '@/components/delayed/AsyncHistory';
import Delayed from '@/pages/Delayed';
import '@/index.css';
function Lobby(){const location=useLocation();return <main className="delayed-page delayed-match-page"><h1>Lobby</h1><Link to="/delayed">Async Mode</Link><Link to="/?sessions=completed">Completed Sessions</Link>{location.search.includes('completed')&&<AsyncHistory viewerName="Hap"/>}</main>;}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes><Route path="/" element={<Lobby/>}/><Route path="/delayed" element={<Delayed/>}/><Route path="/delayed/:matchId" element={<Delayed/>}/></Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
