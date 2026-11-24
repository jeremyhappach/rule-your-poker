import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {FiveAliveSession} from '@/components/fiveAlive/FiveAliveSession';
import '@/index.css';
void preloadApprovedSounds();
const params=new URLSearchParams(location.search),mode=params.get('mode')==='async'?'async':'arcade',player=params.get('player')??'a';
const demo=params.get('demo'),labels:Record<string,string>={keyboard:'1 · Keyboard, tile reveal and guess history',results:'2 · Word Results while waiting',opponent:'3 · Opponent solved result and paired scores',sixth:'4 · Opponent sixth-miss result',award:'5 · Five-second score reveal'};
const resetPreview=()=>void fetch(demo?'/fixture/demo?case='+demo:'/fixture/reset?mode='+mode,{method:'POST'}).then(()=>location.reload());
async function playPreview(){
 if(demo==='keyboard'||demo==='award'){flushSync(()=>{for(const key of demo==='keyboard'?'AMPLE':'APPLE')window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));});window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return;}
 if(demo==='results'){document.querySelector<HTMLButtonElement>('.five-alive-word-results')?.click();return;}
 const state=await fetch('/fixture/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'async',player:'b',op:'state'})}).then(r=>r.json());
 if(state.view.round!==1||state.view.current?.completed)return;
 await fetch('/fixture/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'async',player:'b',op:'action',revision:state.revision,intent:{type:'guess',word:demo==='sixth'?'PLANT':'APPLE'}})});
}
if(demo)document.title=labels[demo]+' · Five Alive preview';
createRoot(document.getElementById('root')!).render(<>
 <style>{'.preview-frame > [data-shell-presentation-mode="fullscreen"]{height:100%}'}</style>
 <aside style={{padding:12,textAlign:'center',background:'#111827',color:'white'}}>
  {demo&&<h1 style={{fontWeight:700,marginBottom:8}}>{labels[demo]}</h1>}
  Local preview · {mode==='arcade'?'Arcade':'Async player '+player.toUpperCase()} · No production connection.
  {demo?<><p style={{margin:'8px 0'}}>{demo==='keyboard'?'STARE is saved. Reveal AMPLE to inspect colors, left-to-right flips and both retained rows.':demo==='results'?'You finished word 2. Open the scorecard while the opponent is still playing.':demo==='award'?'Two guesses are saved. Solve APPLE and watch the full five-second calculation before the score moves.':'Every guess reveals its colors without letters. After all five tiles of the successful guess finish, the answer drops into that row only.'}</p><button style={{padding:'8px 16px',border:'1px solid #f3c454',borderRadius:8,marginBottom:8}} onClick={()=>void playPreview()}>{demo==='results'?'Open Word Results':demo==='keyboard'?'Reveal AMPLE':demo==='award'?'Solve APPLE and show score':'Play opponent result'}</button><br/></>:<> Try STARE, AMPLE, then APPLE. </>}
  <button onClick={resetPreview}>Reset preview</button>
  {' · '}<button onClick={()=>location.reload()}>Refresh</button>
  {' · '}<button onClick={()=>window.dispatchEvent(new Event('online'))}>Reconnect</button>
  {' · '}<a href={'?mode='+(mode==='arcade'?'async&player=a':'arcade')}>Switch mode</a>
  {mode==='async'&&<> · <a target="_blank" href={'?mode=async&player='+(player==='a'?'b':'a')}>Open other player</a></>}
 </aside>
 <div className="preview-frame" style={{height:760,maxWidth:460,margin:'auto'}}><MemoryRouter><FiveAliveSession mode={mode} id={mode} userId={player} matchId="preview"/></MemoryRouter></div>
</>);
