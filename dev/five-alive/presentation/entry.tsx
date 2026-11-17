import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {FiveAliveSession} from '@/components/fiveAlive/FiveAliveSession';
import '@/index.css';
const params=new URLSearchParams(location.search),mode=params.get('mode')==='async'?'async':'arcade',player=params.get('player')??'a';
createRoot(document.getElementById('root')!).render(<>
 <style>{'.preview-frame > [data-shell-presentation-mode="fullscreen"]{height:100%}'}</style>
 <aside style={{padding:12,textAlign:'center',background:'#111827',color:'white'}}>
  Local preview · {mode==='arcade'?'Arcade':'Async player '+player.toUpperCase()} · No production connection.
  {' '}Try STARE, AMPLE, then APPLE.{' '}
  <button onClick={()=>void fetch('/fixture/reset?mode='+mode,{method:'POST'}).then(()=>location.reload())}>Reset preview</button>
  {' · '}<button onClick={()=>location.reload()}>Refresh</button>
  {' · '}<button onClick={()=>window.dispatchEvent(new Event('online'))}>Reconnect</button>
  {' · '}<a href={'?mode='+(mode==='arcade'?'async&player=a':'arcade')}>Switch mode</a>
  {mode==='async'&&<> · <a target="_blank" href={'?mode=async&player='+(player==='a'?'b':'a')}>Open other player</a></>}
 </aside>
 <div className="preview-frame" style={{height:760,maxWidth:460,margin:'auto'}}><MemoryRouter><FiveAliveSession mode={mode} id={mode} userId={player} matchId="preview"/></MemoryRouter></div>
</>);
