// Local presentation only: callbacks update text and never contact production.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlayerOptionsMenu} from '@/components/PlayerOptionsMenu';
import {CanonicalTableHeader} from '@/lib/canonicalShell/CanonicalTableHeader';
import '@/index.css';
import '@/lib/canonicalShell/blueHourShell.css';
function Proof(){
 const [action,setAction]=useState('none'),params=new URLSearchParams(location.search);
 return <main data-canonical-shell-root=""><header data-canonical-shell-header=""><CanonicalTableHeader title="Live game"><PlayerOptionsMenu
  variant={params.get('desktop')?'desktop':'mobile'} gameStatus="in_progress" isObserver={params.has('observer')}
  waiting={false} isSittingOut={false} autoAnte={false} autoAnteRunback={false} sitOutNextHand={false} standUpNextHand={false}
  onAutoAnteChange={()=>setAction('auto')} onAutoAnteRunbackChange={()=>setAction('runback')} onSitOutNextHandChange={()=>setAction('sit')}
  onStandUpNextHandChange={()=>setAction('stand')} onStandUpNow={()=>setAction('stand-now')} onLeaveGameNow={()=>setAction('leave')}
  isHost onTogglePause={()=>setAction('pause')} onEndSession={()=>setAction('end')} canBlastGame={!params.has('restricted')}
  onBlastGame={()=>setAction('blast')} deckColorMode="two_color" onDeckColorModeChange={()=>setAction('deck')}/></CanonicalTableHeader></header>
  <div data-canonical-felt-interaction-layer="" style={{padding:32}}><button onClick={()=>setAction('turn')}>Turn control</button></div><output>{action}</output>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Proof/>);
