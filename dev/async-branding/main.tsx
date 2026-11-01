import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useLocation} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import Delayed from '@/pages/Delayed';
import {AsyncGameHeader} from '@/components/delayed/AsyncGameHeader';
import {ASYNC_GAME_BRANDING} from '@/lib/delayed/gameBranding';
import {findGame} from '@/lib/gameCatalog';
import '@/index.css';
function Review(){
  const location=useLocation(),params=new URLSearchParams(location.search);
  if(params.has('review')||params.has('finale')||location.pathname.includes('/play/'))return <main className="delayed-page delayed-match-page"><h1>Verified existing destination</h1><p>{location.pathname+location.search}</p></main>;
  if(location.pathname==='/brands')return <main className="delayed-page delayed-match-page"><h1>Prepared branding only</h1><p>No game admission is enabled here.</p><section className="delayed-match-home"><ol className="delayed-lineup">{Object.keys(ASYNC_GAME_BRANDING).map((game,i)=><li className="delayed-game-card" key={game}><AsyncGameHeader game={game} name={findGame(game)?.name??game} ordinal={i+1} stake={5}/></li>)}</ol></section></main>;
  return <Delayed/>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter><Routes><Route path="/delayed/:matchId" element={<Review/>}/><Route path="/delayed/:matchId/play/:childId" element={<Review/>}/><Route path="*" element={<Review/>}/></Routes></BrowserRouter></TooltipProvider>);
