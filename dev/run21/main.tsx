import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualPreferencesProvider } from '@/hooks/useVisualPreferences';
import { GeometryLabDraftProvider, useGeometryLabDraft, useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { CanonicalRun21Fixture } from './CanonicalRun21Fixture';
import { Run21Replay } from '@/components/run21/Run21Replay';
import { DEFAULT_CONFIG, type Intent, type Match, type Projection } from '@/lib/run21/model';
import { act, fixtureDeck, fixtureMatch, PLAYERS, simulateRound, uuid } from '@/lib/run21/fixtures';
import { prepareRound, project } from '@/lib/run21/engine';
import { chooseAction } from '@/lib/run21/bot';
import { exportReplay } from '@/lib/run21/history';
import { aggregate, duration, standardDeck, total } from '@/lib/run21/rules';
import { registerRun21Geometry, RUN21_ARTIFACTS, RUN21_GEOMETRY_DEFAULTS, RUN21_GEOMETRY_KEY, RUN21_PREVIEWS, sanitizeGeometry, type Run21Preview, type Run21Geometry } from '@/lib/run21/geometry';
import { RUN21_PREVIEW_FAMILIES, run21Setup } from '@/lib/run21/discovery';
import '@/index.css';
import './preview.css';

registerRun21Geometry();
const [human,bot]=PLAYERS.map(p=>p.id);
function previewScene(scene: Run21Preview,perspective: string): Projection {
  const focus=perspective==='opponent'?bot:human;
  let m=fixtureMatch();m=act(m,human,{type:'ready'},0);m=act(m,bot,{type:'ready'},0);
  // Geometry scenes represent an already-playing round, separate from live admission.
  for(const board of Object.values(m.rounds[0].boards)){board.startedAt=0;board.deadline=duration(m.config);}
  if(scene==='pass-used')m=act(m,focus,{type:'pass'},300);
  if(scene==='time-expired')m=act(m,focus,{type:'expire'},250000);
  if(scene==='round-reveal')m=simulateRound(m);
  if(perspective==='observer')return project(m,null);
  const view=project(m,focus);
  if(scene==='remote')return project(m,bot);
  if(['maximum-depth','column-counts','collect-available','collect-unavailable','bust'].includes(scene)){
    const board=view.boards[focus]!;
    const deck=standardDeck();
    if(scene==='collect-available')board.columns=Array.from({length:5},(_,i)=>i<4?[deck[i*13+12],deck[i*13+11],deck[i*13]]:[deck[10],deck[23]]);
    else if(scene==='maximum-depth')board.columns=[deck.filter(c=>['A','2'].includes(c.rank)).concat(deck.filter(c=>c.rank==='3').slice(0,3)),[],[],[],[]];
    else if(scene==='collect-unavailable')board.columns=Array.from({length:5},(_,i)=>i<4?[deck[i*13+12],deck[i*13+7]]:[deck[10],deck[23]]);
    else board.columns=[[deck[0]],[deck[1],deck[2]],[deck[3],deck[4],deck[5]],deck.slice(13,17),deck.slice(26,31)];
    if(scene==='bust')board.columns[4]=[deck[12],deck[11],deck[40]];
    if(scene==='bust'){
      board.result={reason:'bust',at:2000,aggregate:aggregate(board,view.config),totals:board.columns.map(c=>total(c,21).value),aceElevations:[0,0,0,0,0],multiplier:0,speed:230,score:0};
      view.playStatus[focus]='finished';
    }
  }
  return view;
}
function Lab(){
  const [mode,setMode]=useState<'play'|'geometry'|'replay'>('play');
  const [family,setFamily]=useState('Other');
  const [stake,setStake]=useState(10);
  const [seed,setSeed]=useState(21);
  const [match,setMatch]=useState<Match>(()=>fixtureMatch());
  const [scene,setScene]=useState<Run21Preview>('active');
  const [perspective,setPerspective]=useState('self');

  const [now,setNow]=useState(0);
  const [error,setError]=useState('');
  const base=useRef(Date.now());
  const [committed,setCommitted]=useState(RUN21_GEOMETRY_DEFAULTS);
  const committedRef=useRef(committed);committedRef.current=committed;
  const drafts=useGeometryLabDraft();
  const geometry=useDomainDraft<Run21Geometry>(RUN21_GEOMETRY_KEY,RUN21_GEOMETRY_DEFAULTS);
  const {registerSeed,unregisterSeed,registerCommitAdapter,unregisterCommitAdapter}=drafts;
  useEffect(()=>{
    registerSeed(RUN21_GEOMETRY_KEY,()=>committedRef.current);
    registerCommitAdapter(RUN21_GEOMETRY_KEY,async value=>{setCommitted(sanitizeGeometry(value));return {ok:true};});
    return ()=>{unregisterSeed(RUN21_GEOMETRY_KEY);unregisterCommitAdapter(RUN21_GEOMETRY_KEY);};
  },[registerSeed,unregisterSeed,registerCommitAdapter,unregisterCommitAdapter]);
  const clock=()=>Date.now()-base.current;
  const submit=(intent:Intent)=>{setError('');setMatch(m=>{
    try{return act(m,human,intent,Math.max(clock(),m.updatedAt));}catch(e){setError((e as Error).message);return m;}
  });};
  const round=match.rounds[match.rounds.length-1];
  const botBoard=round.boards[bot];
  const humanBoard=round.boards[human];
  // Visual projection only. The local fixture deadline command is scheduled separately.
  useEffect(()=>{if(mode!=='play')return;const id=setInterval(()=>setNow(clock()),50);return()=>clearInterval(id);},[mode]);
  useEffect(()=>{
    if(mode!=='play'||!botBoard.current||botBoard.result)return;
    const choice=chooseAction(project(match,bot),Math.max(clock(),match.updatedAt),{seed,minActionMs:220,maxActionMs:420});
    if(!choice)return;
    const id=setTimeout(()=>setMatch(m=>m.rounds[m.rounds.length-1].id===round.id&&!m.rounds[m.rounds.length-1].boards[bot].result?act(m,bot,choice.intent,Math.max(clock(),m.updatedAt)):m),choice.delayMs);
    return()=>clearTimeout(id);
    // Scheduling is keyed to the bot's own authority revision, never the human's taps.
  },[mode,round.id,botBoard.revision,botBoard.result,seed]);
  const deadline=Math.min(...Object.values(round.boards).filter(b=>b.deadline!==null&&!b.result).map(b=>b.deadline!));
  useEffect(()=>{
    if(!Number.isFinite(deadline)||mode!=='play')return;
    const id=setTimeout(()=>setMatch(m=>{
      let next=m;const at=Math.max(clock(),m.updatedAt,deadline);
      for(const p of next.players){const board=next.rounds[next.rounds.length-1].boards[p.id];if(!board.result&&board.deadline!==null&&at>=board.deadline)next=act(next,p.id,{type:'expire'},at);}
      return next;
    }),Math.max(0,deadline-clock()));return()=>clearTimeout(id);
  },[mode,round.id,deadline]);
  const sample=useMemo(()=>previewScene(scene,perspective),[scene,perspective]);
  const replay=useMemo(()=>exportReplay(match,human),[match]);
  const liveView=project(match,human);
  const view=mode==='geometry'?sample:liveView;
  function start(){
    run21Setup(stake,PLAYERS.map(p=>p.id));base.current=Date.now();setNow(0);
    let m=fixtureMatch(DEFAULT_CONFIG,[],seed,stake);
    m=act(m,human,{type:'ready'},0);m=act(m,bot,{type:'ready'},0);setMatch(m);
  }
  function nextRound(){setMatch(m=>{
    let next=act(m,human,{type:'acknowledge'},Math.max(clock(),m.updatedAt));next=act(next,bot,{type:'acknowledge'},next.updatedAt);
    next=prepareRound(next,uuid(100+next.rounds.length),next.rounds[next.rounds.length-1].id,fixtureDeck([],seed+next.rounds.length),next.updatedAt);
    next=act(next,human,{type:'ready'},next.updatedAt);return act(next,bot,{type:'ready'},next.updatedAt);
  });}
  const header=<header className="run21-lab-header"><strong>Run21</strong><span>ISOLATED LAB</span>
    <nav aria-label="Lab views">{(['play','geometry','replay'] as const).map(v=><button key={v} aria-pressed={mode===v} onClick={()=>setMode(v)}>{v}</button>)}</nav>
  </header>;
  const controls=<><p className="lab-note">Offline fixture · synthetic decks · no money movement</p>
        {mode==='play'&&<><h2>Match setup</h2><div className="family-options" aria-label="Game families">{RUN21_PREVIEW_FAMILIES.map(f=><button key={f} aria-pressed={family===f} onClick={()=>setFamily(f)}>{f}</button>)}</div>
          {family==='Other'?<><p>Run21 · Two players · Three rounds</p><label>Match stake<input type="number" min={0} step={1} value={stake} onChange={e=>setStake(+e.target.value)}/></label><label>Simulation seed<input type="number" value={seed} onChange={e=>setSeed(+e.target.value)}/></label>
            <button className="primary" onClick={start} disabled={!Number.isSafeInteger(stake)||stake<0}>{humanBoard.presented.length?'Restart simulation':'Start match'}</button><p>One stake for the match. Sudden death adds no wager.</p></>:<p>Existing games remain in the main app.</p>}
          {round.revealed&&!match.winnerId&&<button className="primary" onClick={nextRound}>Next round</button>}
          {match.winnerId&&<p role="status">{match.players.find(p=>p.id===match.winnerId)!.name} wins. Settlement integration is gated.</p>}
          <button onClick={()=>{setMatch(m=>simulateRound(m,seed));setMode('replay');}}>Simulate round and replay</button>
        </>}
        {mode==='geometry'&&<><h2>Run21 Geometry Lab</h2><label>Scene<select data-run21-scene value={scene} onChange={e=>setScene(e.target.value as Run21Preview)}>{RUN21_PREVIEWS.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>Viewer<select data-run21-viewer value={perspective} onChange={e=>setPerspective(e.target.value)}><option value="self">Self</option><option value="opponent">Opponent</option><option value="observer">Observer</option></select></label>
          {(Object.keys(RUN21_GEOMETRY_DEFAULTS) as (keyof Run21Geometry)[]).map(key=><label key={key}>{key==='controlsY'?'Deck / current Y':key}<input type="range" min={key==='boardWidth'?80:key==='controlsY'?87:key==='boardY'?53:82} max={key==='boardWidth'?98:key==='controlsY'?88:key==='boardY'?54:88} value={geometry.value[key]*100} onChange={e=>geometry.setValue(g=>({...g,[key]:+e.target.value/100}))}/></label>)}
          <button onClick={()=>void drafts.applyAll()} disabled={!drafts.isDirty}>Apply locally</button><button onClick={drafts.cancelAll}>Cancel draft</button><button onClick={geometry.reset}>Reset defaults</button>
          <details><summary>Artifacts</summary><ul>{RUN21_ARTIFACTS.map(a=><li key={a.artifactId}>{a.label} <code>{a.artifactId}</code></li>)}</ul></details>
          <p>Uses the existing descriptor, defaults and draft contracts. Shared game-menu registration awaits the checkpoint.</p>
        </>}
        {mode==='replay'&&<><h2>Recorded actions</h2><p>Only accepted actions enter this replay. Scores and speed values use recorded authority time.</p><p>{match.events.length} events · {match.rounds.length} rounds</p></>}
        {error&&<p role="alert">{error}</p>}

    </>;
  const render=(frame:Projection,time:number,replayControls?:React.ReactNode)=><CanonicalRun21Fixture view={frame} now={time}
    header={header} pane={<>{replayControls}{controls}</>} geometry={geometry.value} onIntent={mode==='replay'?undefined:mode==='play'?submit:()=>{}}/>;
  return mode==='replay'?<Run21Replay replay={replay} renderFrame={render}/>:render(view,mode==='geometry'?0:now);
}
const root=createRoot(document.getElementById('root')!);
root.render(<VisualPreferencesProvider userId={undefined}><GeometryLabDraftProvider><Lab/></GeometryLabDraftProvider></VisualPreferencesProvider>);

if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
