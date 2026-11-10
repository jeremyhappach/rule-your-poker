import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {arcadeRequest} from '@/lib/arcade/client';
import {ArcadeInfo} from '@/components/arcade/ArcadeInfo';
import {ArcadeAbandonButton} from '@/components/arcade/ArcadeAbandonButton';
import {AchievementTime} from '@/components/arcade/AchievementTime';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {platformAudio} from '@/lib/audio/platformAudio';
import {riverCue} from '@/lib/riverCityRun/audio';
import presentation from '@/lib/riverCityRun/presentation.txt?raw';
import coreUrl from '@/lib/riverCityRun/core.mjs?url';
import './riverCityRun.css';

const COURSE='the-boat';
const requestDefault=<T,>(body:object)=>arcadeRequest<T>({...body,game:'river-city-run'});
type Row={runId:string;name:string;score:number;rank:number;completedAt:string};
type Board={courseId:string;rows:Row[];personalBest:number|null;self:Row|null;activeRun:string|null;admission:boolean};
type View={id:string;revision:number;status:string;serverAt:number;deadline:number|null;score:number;road:{phase:string};casino?:unknown};
const points=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:2});
export function RiverCityRunPage({userId,request=requestDefault}:{userId:string;request?:<T>(body:object)=>Promise<T>}){
 const [screen,setScreen]=useState<'courses'|'board'|'game'>('courses'),[period,setPeriod]=useState<'30'|'all'>('30'),[board,setBoard]=useState<Board|null>(null),[view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
 const iframe=useRef<HTMLIFrameElement>(null),current=useRef<View|null>(null),queue=useRef(Promise.resolve()),alive=useRef(true),serial=useRef(0),generation=useRef(0),audioStops=useRef(new Set<()=>void>());
 const src=useRef(presentation.replace('__CORE_URL__',new URL(coreUrl,location.origin).href));
 const post=(data:object)=>iframe.current?.contentWindow?.postMessage({river:true,...data},location.origin);
 const receive=(next:View,reconcile=false,discardOptimistic=false)=>{if(!alive.current)return;if(current.current?.id===next.id&&next.revision<current.current.revision)return;current.current=next;setView(next);post({kind:'snapshot',view:next,reconcile,discardOptimistic});};
 const loadBoard=async()=>{const value=await request<Board>({op:'leaderboard',courseId:COURSE,window:period});if(value.courseId!==COURSE)throw Error('Wrong course leaderboard.');if(alive.current)setBoard(value);};
 const perform=(fn:()=>Promise<void>)=>{queue.current=queue.current.then(async()=>{if(!alive.current)return;setBusy(true);try{await fn();setError('');}catch(e){setError(e instanceof Error?e.message:'Connection interrupted.');}finally{if(alive.current){setBusy(false);post({kind:'busy',value:false});}}});return queue.current;};
 const refresh=()=>perform(async()=>{if(current.current&&screen==='game')receive(await request<View>({op:'state',runId:current.current.id}),true);else await loadBoard();});
 const intent=(value:Record<string,unknown>)=>{
  const ticket=generation.current;
  return perform(async()=>{if(ticket!==generation.current||!current.current)return;const previous=current.current;
   const body={op:'action',runId:previous.id,requestId:crypto.randomUUID(),revision:previous.revision,intent:value};
   try{receive(await request<View>(body));}catch(e){generation.current++;receive(await request<View>({op:'state',runId:previous.id}),true,true);throw e;}
  });
 };
 useEffect(()=>{alive.current=true;const release=platformAudio.acquireGameplay();return()=>{alive.current=false;release();audioStops.current.forEach(stop=>stop());};},[]);
 useEffect(()=>{void perform(loadBoard);},[period]);
 useEffect(()=>{const id=new URLSearchParams(location.search).get('run');if(id)void perform(async()=>{receive(await request<View>({op:'state',runId:id}));setScreen('game');});},[]);
 useEffect(()=>{
  const listener=(e:MessageEvent)=>{
   if(e.source!==iframe.current?.contentWindow||e.origin!==location.origin||!e.data?.river)return;
   const data=e.data;
   if(data.kind==='ready'&&current.current)post({kind:'snapshot',view:current.current,reconcile:true});
   if(data.kind==='intent')void intent(data.intent);
   if(data.kind==='state')void refresh();
   if(data.kind==='unlock')platformAudio.unlock();
   if(data.kind==='exit')void perform(async()=>{if(current.current?.status==='active')return;setScreen('board');history.replaceState(null,'','?course='+COURSE);await loadBoard();});
   if(data.kind==='sound'&&!document.hidden){const cue=riverCue(data.type);const stop=platformAudio.request({userId,id:'river:'+current.current?.id+':'+serial.current++,expiresAt:performance.now()+900,cue});audioStops.current.add(stop);setTimeout(()=>audioStops.current.delete(stop),1000);}
  };
  window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 },[screen,period,userId]);
 useEffect(()=>{if(screen!=='game'||!view||view.status!=='active'||view.deadline===null)return;const timer=setTimeout(()=>void refresh(),Math.max(20,view.deadline-view.serverAt+25));return()=>clearTimeout(timer);},[screen,view?.id,view?.revision,view?.deadline]);
 useEffect(()=>{const reconnect=()=>{if(!document.hidden)void refresh();};window.addEventListener('online',reconnect);window.addEventListener('focus',reconnect);document.addEventListener('visibilitychange',reconnect);return()=>{window.removeEventListener('online',reconnect);window.removeEventListener('focus',reconnect);document.removeEventListener('visibilitychange',reconnect);};},[screen,period]);
 const launch=()=>void perform(async()=>{platformAudio.unlock();const next=board?.activeRun?await request<View>({op:'state',runId:board.activeRun}):await request<View>({op:'start',courseId:COURSE,requestId:crypto.randomUUID()});current.current=null;receive(next);history.replaceState(null,'','?run='+next.id);setScreen('game');});
 return <main className={'river-app river-'+screen}>
  <nav className="river-nav" aria-label="River City Run navigation">{screen==='game'?<span>The Boat</span>:screen==='board'?<button onClick={()=>setScreen('courses')}>← Courses</button>:<Link to="/arcade">← Arcade</Link>}<div><ArcadeInfo game="river-city-run" name="River City Run" ruleset="river-city-run/1"/><GameplaySoundButton/>{screen==='game'&&view?.status==='active'&&<ArcadeAbandonButton onClick={()=>setConfirm(true)}/>}</div></nav>
  {error&&<div role="alert" className="river-error">{error}<button onClick={()=>void refresh()}>Reconnect</button></div>}
  {screen==='courses'&&<section className="river-courses"><p className="eyebrow">P-Town Originals</p><h1>River City Run</h1><h2>Select a Course</h2><button className="river-course-tile" onClick={()=>setScreen('board')} aria-label="Select The Boat"><img src="/river-city-run/the-boat.png" width="1466" height="564" alt="The Boat"/></button><p>Three minutes across Peoria. Bring your points to Par-A-Dice.</p></section>}
  {screen==='board'&&<section className="river-board"><img className="river-landmark" src="/river-city-run/the-boat-waterfront.png" alt="Illuminated Par-A-Dice waterfront and white riverboat, with Peoria across the river"/><div className="river-board-content"><p className="eyebrow">River City Run · Leaderboard</p><h1>The Boat</h1><div className="river-board-actions"><ArcadeInfo game="river-city-run" name="The Boat" triggerLabel="Rules"/><button className="river-primary" disabled={busy||!board?.admission} onClick={launch}>{board?.activeRun?'Resume':view?.status==='completed'?'Play Again':'Play'}</button></div>
   {view?.status==='completed'&&<p className="river-completed">Final score <strong>{points(view.score)} points</strong></p>}
   <section className="river-rankings" aria-label="The Boat leaderboard"><div className="river-periods">{(['30','all'] as const).map(p=><button key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}>{p==='30'?'Last 30 Days':'All Time'}</button>)}</div>{!board?<p>Loading scores…</p>:<><table className="arcade-score-table"><thead><tr><th>Rank</th><th>Player</th><th>Achieved</th><th>Points</th></tr></thead><tbody>{board.rows.map(row=><tr key={row.runId}><td>{row.rank}</td><td>{row.name}</td><td><AchievementTime completedAt={row.completedAt}/></td><td>{points(row.score)}</td></tr>)}</tbody></table>{!board.rows.length&&<p>No completed runs in this period.</p>}<p>Personal best: {board.personalBest===null?'No completed run':points(board.personalBest)+' points'}</p></>}</section>
  </div></section>}
  {screen==='game'&&view&&<iframe ref={iframe} title="River City Run · The Boat" srcDoc={src.current} className="river-game-frame"/>}
  {confirm&&<div className="river-confirm" role="alertdialog" aria-modal="true" aria-labelledby="river-abandon-title"><section><h2 id="river-abandon-title">Abandon this run?</h2><p>No score will be posted.</p><button onClick={()=>setConfirm(false)}>Keep playing</button><button className="river-primary" disabled={busy} onClick={()=>{setConfirm(false);void intent({type:'abandon'}).then(()=>{if(current.current?.status==='abandoned'){setScreen('board');void loadBoard();}});}}>Abandon</button></section></div>}
 </main>;
}
