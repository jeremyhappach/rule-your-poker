import {useEffect,useRef,useState} from 'react';
import {CourseClubhouse} from './CourseClubhouse';

import {CourseSelection,type ScoreRow} from '@/components/megaCardGolf/CourseSelection';
import {MegaCardGolfGame} from '@/components/megaCardGolf/MegaCardGolfGame';
import {acceptView,type Intent,type MegaView} from '@/lib/megaCardGolf/engine';
import type {CourseConfig,CourseId} from '@/lib/megaCardGolf/config';
import {AudioManager} from '@/lib/audio/audioManager';
import {megaHoleCue} from '@/lib/megaCardGolf/audio';
import '@/components/megaCardGolf/megaCardGolf.css';

type Catalog={courses:CourseConfig[];boards:{id:CourseId;rows:ScoreRow[]}[];archives:{config:CourseConfig;rows:ScoreRow[]}[];active:string|null;admission?:boolean;isAdmin?:boolean};
export function MegaArcade({request,audio,userId,preview=false,onBack,subscribe}:{request:<T>(body:object)=>Promise<T>;audio:AudioManager;userId:string;preview?:boolean;onBack?:()=>void;subscribe?:(runId:string,changed:()=>void)=>()=>void}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[screen,setScreen]=useState<'courses'|'game'|'board'>('courses'),[view,setView]=useState<MegaView|null>(null),[board,setBoard]=useState<CourseId>('sunny-meadows'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now()),[sound,setSound]=useState(preview&&localStorage.getItem('mega-preview-sounds')==='true');
 const clock=useRef({at:Date.now(),received:performance.now()}),lock=useRef(false),lastCue=useRef(''),refreshQueued=useRef(false),refresh=useRef(()=>{}),alive=useRef(true),current=useRef(view);current.current=view;
 const loadCatalog=async()=>setCatalog(await request<Catalog>({op:'catalog'}));
 const receive=(next:MegaView)=>{clock.current={at:next.serverAt,received:performance.now()};setNow(next.serverAt);setView(old=>acceptView(old,next));};
 const restore=async(id:string,silent=true)=>{const next=await request<MegaView>({op:'state',runId:id});if(silent&&next.phase==='scoring')lastCue.current=next.id+'/'+next.hole;receive(next);};
 const perform=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Request failed');}finally{lock.current=false;if(alive.current){setBusy(false);if(refreshQueued.current){refreshQueued.current=false;refresh.current();}}}};
 refresh.current=()=>{if(!alive.current||document.hidden)return;if(lock.current){refreshQueued.current=true;return;}void perform(async()=>{if(current.current&&screen==='game')await restore(current.current.id,false);else await loadCatalog();});};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;refreshQueued.current=false;};},[]);
 useEffect(()=>view&&subscribe?subscribe(view.id,()=>refresh.current()):undefined,[view?.id,subscribe]);
 useEffect(()=>{const uninstall=preview?audio.install():undefined;if(preview)audio.setUser(userId);void perform(async()=>{await loadCatalog();const id=new URLSearchParams(location.search).get('run');if(id){await restore(id);setScreen('game');}});return uninstall;},[]);
 useEffect(()=>{const refresh=()=>{if(!document.hidden)void perform(async()=>{if(current.current&&screen==='game')await restore(current.current.id);else await loadCatalog();});};window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};},[screen]);
 useEffect(()=>{
  if(!view||screen!=='game')return;
  const due=view.dueAt;if(due===null)return;
  const timer=setTimeout(()=>{void perform(async()=>{if(view.status==='completed'){setBoard(view.config.id);setScreen('board');history.replaceState(null,'',location.pathname);await loadCatalog();}else await restore(view.id,false);});},Math.max(0,due-view.serverAt)+60);
  return()=>clearTimeout(timer);
 },[view?.id,view?.revision,view?.dueAt,screen]);
 useEffect(()=>{if(screen!=='game'||view?.phase!=='scoring')return;let raf:number;const frame=()=>{setNow(clock.current.at+performance.now()-clock.current.received);raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);},[screen,view?.id,view?.phase]);
 const scoreResult=view?.phase==='scoring'?view.results.at(-1):null;
 useEffect(()=>{if(!scoreResult||screen!=='game'||now<scoreResult.startedAt+scoreResult.hidden.length*650)return;const id=view!.id+'/'+scoreResult.hole;if(lastCue.current===id)return;lastCue.current=id;return audio.request({userId:userId,id:'mega-hole/'+id,expiresAt:performance.now()+700,cue:megaHoleCue});},[scoreResult,screen,now>=((scoreResult?.startedAt??Infinity)+(scoreResult?.hidden.length??0)*650)]);
 const navigate=async(next:'courses')=>{setScreen(next);history.replaceState(null,'',location.pathname);await loadCatalog();};
 const act=(intent:Intent)=>void perform(async()=>{if(!view)return;const body={op:'action',runId:view.id,requestId:crypto.randomUUID(),revision:view.revision,hole:view.hole,intent};try{receive(await request<MegaView>(body));}catch(e){await restore(view.id);throw e;}});
 const startCourse=()=>void perform(async()=>{const next=await request<MegaView>({op:'start',courseId:board,requestId:crypto.randomUUID()});receive(next);setScreen('game');history.replaceState(null,'','?run='+next.id);await loadCatalog();});
 const selectedCourse=catalog?.courses.find(c=>c.id===board);
 return <div className="mega-app" data-screen={screen}><header className="mega-topbar"><div className="mega-brand"><span aria-hidden>⚑</span> MEGA CARD GOLF</div><nav aria-label="Mega Card Golf navigation">
 {screen==='courses'&&onBack&&<button onClick={onBack}>Back to Arcade</button>}
 {preview&&screen==='game'&&<button aria-pressed={sound} onClick={()=>{const next=!sound;setSound(next);localStorage.setItem('mega-preview-sounds',String(next));audio.setPreference(userId,next);}}>Sound {sound?'on':'off'}</button>}
 </nav></header>
 {error&&<div role="alert" className="mega-error">{error}<button onClick={()=>void perform(async()=>{if(view&&screen==='game')await restore(view.id);else await loadCatalog();})}>Reconnect</button></div>}
 {!catalog?<p className="mega-full-board">Loading courses…</p>:<>
 {screen==='courses'&&<>

  <CourseSelection courses={catalog.courses} request={request} busy={busy} onSelect={id=>{setBoard(id);setScreen('board');}}/>
 </>}
  {screen==='board'&&catalog.active&&<div className="mega-resume">Your course is still in progress. <button disabled={busy} onClick={()=>void perform(async()=>{await restore(catalog.active!);setScreen('game');history.replaceState(null,'','?run='+catalog.active);})}>Resume course</button> · <button disabled={busy} onClick={()=>void perform(async()=>{const r=await request<MegaView>({op:'state',runId:catalog.active});await request({op:'action',runId:r.id,requestId:crypto.randomUUID(),revision:r.revision,hole:r.hole,intent:{type:'abandon'}});await loadCatalog();})}>Abandon unranked</button></div>}
 {screen==='game'&&view&&<MegaCardGolfGame view={view} now={now} busy={busy} onIntent={act} onExit={()=>void perform(()=>navigate('courses'))}/>}
 {screen==='board'&&selectedCourse&&<CourseClubhouse course={selectedCourse} archives={catalog.archives.filter(a=>a.config.id===board)} request={request} busy={busy} canStart={selectedCourse.enabled&&catalog.admission!==false} completedScore={view?.status==='completed'&&view.config.id===board?view.score:undefined} onStart={startCourse} onReturn={()=>void perform(()=>navigate('courses'))}/>}
 </>}</div>;
}
