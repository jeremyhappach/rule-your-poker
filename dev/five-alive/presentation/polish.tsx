import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {FiveAliveSession} from '@/components/fiveAlive/FiveAliveSession';
import {platformAudio} from '@/lib/audio/platformAudio';
import {fiveAliveBink,fiveAliveInvalid,fiveAlivePoof,fiveAliveSuccess} from '@/components/fiveAlive/fiveAliveAudio';
import '@/index.css';
void preloadApprovedSounds();

const sizes={narrow:[320,568],phone:[390,844],tablet:[768,1024],laptop:[1366,768]} as const;
type Size=keyof typeof sizes;
function PlaySession({word}:{word?:string}){
 useEffect(()=>{
  if(!word)return;
  let played=false,frame=0;
  const play=()=>{if(played||!document.querySelector<HTMLButtonElement>('.five-alive-keyboard button:not(:disabled)'))return;
   played=true;observer.disconnect();frame=requestAnimationFrame(()=>{
    flushSync(()=>{for(const key of word)window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));});
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   });
  };
  const observer=new MutationObserver(play);observer.observe(document.getElementById('preview-game')!,{subtree:true,childList:true,attributes:true});play();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[word]);
 return <MemoryRouter><FiveAliveSession mode="arcade" id="arcade" userId="a"/></MemoryRouter>;
}
function Preview(){
 const [size,setSize]=useState<Size>((new URLSearchParams(location.search).get('size') as Size)||'phone');
 const [scenario,setScenario]=useState({id:0,word:undefined as string|undefined}),[busy,setBusy]=useState(false),[label,setLabel]=useState('Ready to play');
 const audio=useSyncExternalStore(platformAudio.subscribe,platformAudio.getSnapshot);
 useEffect(()=>{if(sessionStorage.getItem('five-alive-preview-muted')===null)sessionStorage.setItem('five-alive-preview-muted','true');const uninstall=platformAudio.install();platformAudio.setUser('a');const release=platformAudio.acquireGameplay();return()=>{release();uninstall();};},[]);
 async function run(kind:string){
  setBusy(true);
  try{const response=await fetch(kind.startsWith('solve')?'/fixture/demo?case='+kind:'/fixture/reset?mode=arcade',{method:'POST'});
   if(!response.ok)throw Error('Unable to prepare local fixture');
   setLabel(kind==='invalid'?'Invalid word · shake, soft cue, editable draft':kind==='wrong'?'Wrong guess · five flips → explosion → bink':kind==='reset'?'Ready to play':`Solve on guess ${kind.at(-1)} · celebration → five-second calculation → score`);
   if(kind!=='reset')document.getElementById('preview-game')?.scrollIntoView({block:'start'});
   setScenario(value=>({id:value.id+1,word:kind==='invalid'?'ZZZZZ':kind==='wrong'?'STARE':kind==='reset'?undefined:'APPLE'}));
  }finally{setBusy(false);}
 }
 const sound=(name:string,cue:typeof fiveAliveInvalid)=>platformAudio.request({userId:'a',id:'five-alive-preview:'+name+':'+crypto.randomUUID(),expiresAt:performance.now()+2500,cue});
 return <>
  <style>{`body{margin:0;background:#111827;color:#fff}.preview-controls{padding:1rem;max-width:70rem;margin:auto;font:14px system-ui}.preview-controls h1{font-size:1.2rem;font-weight:800}.preview-controls p{margin:.5rem 0}.preview-controls fieldset{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0}.preview-controls legend{font-weight:700;margin-bottom:.35rem}.preview-controls button,.preview-controls select{min-height:44px;padding:.5rem .8rem;border:1px solid #e9b63b;border-radius:.5rem;background:#17352e;color:#fff}.preview-controls button:disabled{opacity:.5}.preview-frame{margin:0 auto;max-width:100%;outline:1px solid #667085}.preview-frame>[data-shell-presentation-mode="fullscreen"]{height:100%}`}</style>
  <aside className="preview-controls"><h1>Five Alive · local polish review</h1><p>Actual game components and original Five Alive sounds. Enable sounds to listen; this preference is local to the preview. No production connection.</p>
   <label>Layout <select aria-label="Preview size" value={size} onChange={e=>setSize(e.target.value as Size)}>{Object.entries(sizes).map(([name,[w,h]])=><option key={name} value={name}>{name} · {w} × {h}</option>)}</select></label>{' '}
   <button disabled={audio.enabled===null||audio.saving} onClick={()=>void platformAudio.savePreference('a',!audio.enabled)}>{audio.enabled?'Mute sounds':'Enable sounds'}</button>
   <fieldset disabled={busy}><legend>Play animation + sound</legend><button onClick={()=>void run('invalid')}>Invalid word</button><button onClick={()=>void run('wrong')}>Wrong guess</button>{[1,2,3,4,5,6].map(n=><button key={n} onClick={()=>void run('solve'+n)}>Solve {n}</button>)}</fieldset>
   <fieldset><legend>Listen to each original cue</legend><button onClick={()=>sound('invalid',fiveAliveInvalid)}>Invalid sound</button><button onClick={()=>sound('burst',fiveAlivePoof)}>Explosion sound</button><button onClick={()=>sound('bink',fiveAliveBink)}>Bink sound</button>{[1,2,3,4,5,6].map(n=><button key={n} onClick={()=>sound('solve'+n,fiveAliveSuccess[n])}>Sound {n}{n===6?' · phew':''}</button>)}</fieldset>
   <button onClick={()=>void run('reset')}>Reset board</button>{' '}<button onClick={()=>location.reload()}>Refresh</button>{' '}<button onClick={()=>window.dispatchEvent(new Event('online'))}>Reconnect</button><p role="status">{label}</p><p>Try STARE, AMPLE, then APPLE. Solves retain the calculation for at least five seconds. Select any scenario to replay it.</p>
  </aside>
  <div id="preview-game" className="preview-frame" style={{width:sizes[size]?.[0]??390,height:sizes[size]?.[1]??844}}><PlaySession key={scenario.id} word={scenario.word}/></div>
 </>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
