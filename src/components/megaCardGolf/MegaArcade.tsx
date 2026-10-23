import {useEffect,useRef,useState} from 'react';
import {CourseClubhouse} from './CourseClubhouse';

import {CourseSelection,type ScoreRow} from '@/components/megaCardGolf/CourseSelection';
import {MegaCardGolfGame} from '@/components/megaCardGolf/MegaCardGolfGame';
import {acceptView,type Intent,type MegaView} from '@/lib/megaCardGolf/engine';
import type {CourseConfig,CourseId} from '@/lib/megaCardGolf/config';
import {AudioManager} from '@/lib/audio/audioManager';
import {megaHoleCue,megaCupCue} from '@/lib/megaCardGolf/audio';
import {emptyPresentation,receivePresentation,presentationFrame} from '@/lib/megaCardGolf/presentation';
import '@/components/megaCardGolf/megaCardGolf.css';

type Catalog={courses:CourseConfig[];boards:{id:CourseId;rows:ScoreRow[]}[];archives:{config:CourseConfig;rows:ScoreRow[]}[];active:string|null;admission?:boolean;isAdmin?:boolean};
export function MegaArcade({request,audio,userId,preview=false,onBack,subscribe}:{request:<T>(body:object)=>Promise<T>;audio:AudioManager;userId:string;preview?:boolean;onBack?:()=>void;subscribe?:(runId:string,changed:()=>void)=>()=>void}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[screen,setScreen]=useState<'courses'|'game'|'board'>('courses'),[view,setView]=useState<MegaView|null>(null),[board,setBoard]=useState<CourseId>('sunny-meadows'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now()),[sound,setSound]=useState(preview&&localStorage.getItem('mega-preview-sounds')==='true');
 const [presentation,setPresentation]=useState(emptyPresentation);
 const autoDrawAttempt=useRef<string|null>(null);
 const frame=presentationFrame(presentation,performance.now(),typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const clock=useRef({at:Date.now(),received:performance.now()}),lock=useRef(false),refreshQueued=useRef(false),refresh=useRef(()=>{}),alive=useRef(true),current=useRef(view);current.current=view;
 const loadCatalog=async()=>setCatalog(await request<Catalog>({op:'catalog'}));
 const receive=(next:MegaView,silent=false,intent?:Intent)=>{const accepted=acceptView(current.current,next);if(accepted!==next)return;current.current=next;clock.current={at:next.serverAt,received:performance.now()};setNow(next.serverAt);setView(next);setPresentation(old=>receivePresentation(old,next,performance.now(),silent,intent));};
 const restore=async(id:string,silent=true)=>{receive(await request<MegaView>({op:'state',runId:id}),silent);};
 const perform=async(fn:()=>Promise<void>,clearError=true)=>{if(lock.current)return;lock.current=true;setBusy(true);if(clearError)setError('');try{await fn();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Request failed');}finally{lock.current=false;if(alive.current){setBusy(false);if(refreshQueued.current){refreshQueued.current=false;refresh.current();}}}};
 refresh.current=()=>{if(!alive.current||document.hidden)return;if(lock.current){refreshQueued.current=true;return;}void perform(async()=>{if(current.current&&screen==='game')await restore(current.current.id,false);else await loadCatalog();},false);};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;refreshQueued.current=false;};},[]);
 useEffect(()=>view&&subscribe?subscribe(view.id,()=>refresh.current()):undefined,[view?.id,subscribe]);
 useEffect(()=>{const uninstall=preview?audio.install():undefined;if(preview)audio.setUser(userId);void perform(async()=>{await loadCatalog();const id=new URLSearchParams(location.search).get('run');if(id){await restore(id);setScreen('game');}});return uninstall;},[]);
 useEffect(()=>{const refresh=()=>{if(!document.hidden)void perform(async()=>{if(current.current&&screen==='game'){await restore(current.current.id);autoDrawAttempt.current=null;}else await loadCatalog();});};window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};},[screen]);
 useEffect(()=>{
  if(!view||screen!=='game')return;
  const due=view.dueAt;if(due===null)return;
  if(view.status!=='active')return;
  const timer=setTimeout(()=>refresh.current(),Math.max(0,due-view.serverAt)+60);
  return()=>clearTimeout(timer);
 },[view?.id,view?.revision,view?.dueAt,screen]);
 const animating=!!frame?.locked||view?.phase==='scoring';
 useEffect(()=>{if(screen!=='game'||!view||!animating)return;let raf:number;const tick=()=>{setNow(clock.current.at+performance.now()-clock.current.received);raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[screen,view?.id,animating]);
 useEffect(()=>{if(screen!=='game'||!frame?.cue?.fresh||document.hidden)return;return audio.request({userId,id:frame.cue.id,expiresAt:performance.now()+700,cue:frame.cue.kind==='cup'?megaCupCue:megaHoleCue});},[screen,frame?.cue?.id,audio,userId]);
 const completedReady=view?.status==='completed'&&!frame?.locked&&now>=view.deadline;
 useEffect(()=>{if(screen!=='game'||!completedReady||!view||busy)return;void perform(async()=>{setBoard(view.config.id);setScreen('board');history.replaceState(null,'',location.pathname);await loadCatalog();});},[screen,completedReady,view?.id,busy]);
 const navigate=async(next:'courses')=>{setScreen(next);history.replaceState(null,'',location.pathname);await loadCatalog();};
 const act=(intent:Intent)=>{if(frame?.locked)return;void perform(async()=>{const previous=current.current;if(!previous)return;const body={op:'action',runId:previous.id,requestId:crypto.randomUUID(),revision:previous.revision,hole:previous.hole,intent};try{const next=await request<MegaView>(body);receive(next,false,intent);if(next.status==='abandoned'){setBoard(next.config.id);setScreen('board');history.replaceState(null,'',location.pathname);await loadCatalog();}}catch(e){await restore(previous.id);throw e;}});};
 // Automatic input uses the same serialized, revision-checked server action as a tap.
 // Never retry a failed draw at the same revision without explicit recovery.
 useEffect(()=>{
  if(screen!=='game'||!view||busy||lock.current||error||frame?.locked||document.hidden
   ||view.status!=='active'||view.phase!=='playing'||view.pending!==null||view.stockRemaining<=0
   ||clock.current.at+performance.now()-clock.current.received>=view.deadline)return;
  const key=view.id+'/'+view.hole+'/'+view.revision;
  if(autoDrawAttempt.current===key)return;
  autoDrawAttempt.current=key;act({type:'draw'});
 },[screen,view?.id,view?.hole,view?.revision,view?.serverAt,busy,error,frame?.locked]);
 const startCourse=()=>void perform(async()=>{const next=await request<MegaView>({op:'start',courseId:board,requestId:crypto.randomUUID()});receive(next);setScreen('game');history.replaceState(null,'','?run='+next.id);await loadCatalog();});
 const selectedCourse=catalog?.courses.find(c=>c.id===board);
 return <div className="mega-app" data-screen={screen}><header className="mega-topbar"><div className="mega-brand"><span aria-hidden>⚑</span> MEGA CARD GOLF</div><nav aria-label="Mega Card Golf navigation">
 {screen==='courses'&&onBack&&<button onClick={onBack}>Back to Arcade</button>}
 {preview&&screen==='game'&&<button aria-pressed={sound} onClick={()=>{const next=!sound;setSound(next);localStorage.setItem('mega-preview-sounds',String(next));audio.setPreference(userId,next);}}>Sound {sound?'on':'off'}</button>}
 </nav></header>
 {error&&<div role="alert" className="mega-error">{error}<button onClick={()=>void perform(async()=>{if(view&&screen==='game'){await restore(view.id);autoDrawAttempt.current=null;}else await loadCatalog();})}>Reconnect</button></div>}
 {!catalog?<p className="mega-full-board">Loading courses…</p>:<>
 {screen==='courses'&&<>

  <CourseSelection courses={catalog.courses} request={request} busy={busy} onSelect={id=>{setBoard(id);setScreen('board');}}/>
 </>}
  {screen==='board'&&catalog.active&&<div className="mega-resume">Your course is still in progress. <button disabled={busy} onClick={()=>void perform(async()=>{await restore(catalog.active!);setScreen('game');history.replaceState(null,'','?run='+catalog.active);})}>Resume course</button> · <button disabled={busy} onClick={()=>void perform(async()=>{const r=await request<MegaView>({op:'state',runId:catalog.active});await request({op:'action',runId:r.id,requestId:crypto.randomUUID(),revision:r.revision,hole:r.hole,intent:{type:'abandon'}});await loadCatalog();})}>Abandon unranked</button></div>}
 {screen==='game'&&view&&<MegaCardGolfGame view={frame?.view??view} presentation={frame??undefined} now={now} busy={busy} canAbandon={view.status==='active'} onIntent={act} onExit={()=>act({type:'abandon'})}/>}
 {screen==='board'&&selectedCourse&&<CourseClubhouse course={selectedCourse} archives={catalog.archives.filter(a=>a.config.id===board)} request={request} busy={busy} canStart={selectedCourse.enabled&&catalog.admission!==false} completedScore={view?.status==='completed'&&view.config.id===board?view.score:undefined} onStart={startCourse} onReturn={()=>void perform(()=>navigate('courses'))}/>}
 </>}</div>;
}
