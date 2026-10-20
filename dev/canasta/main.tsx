import React, {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {CanonicalSeatCluster} from '@/lib/canonicalShell/CanonicalSeatCluster';
import {useSeatAnchors} from '@/lib/canonicalShell/SeatAnchorLayer';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import {ShellTimerRail,useShellTimer} from '@/lib/canonicalShell/ShellTimerRail';
import {useShellTabBar,type ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {useCanonicalFeltInteractionLayerElement} from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useCardTransport} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import {CanonicalChipDisc} from '@/components/canonicalShell/CanonicalChipDisc';
import {PlayingCard} from '@/components/PlayingCard';
import {platformAudio} from '@/lib/audio/platformAudio';
import {cardSwooshCueAt} from '@/lib/audio/cardSwoosh';
import {isResolvedJoker,physicalCardLabel,type PhysicalCard} from '@/lib/cardGames/physicalCard';
import {resolveTransportCardFace} from '@/lib/cardGames/resolvedCardFace';
import {safeFeltRect,type Rect} from '@/lib/run21/safeFelt';
import {compareCards,openingReport,meldError,pickupError,turnPlan,canastas,standard,redThree,type Meld} from '@/lib/canasta/rules';
import type {Rank} from '@/lib/cardUtils';
import {fixture,SCENES,SELF,OTHER,type Scene,type Fixture} from './fixtures';
import '@/index.css';
import './review.css';

function Face({card,selected=false}:{card:PhysicalCard;selected?:boolean}) {
  return <PlayingCard card={isResolvedJoker(card.face)?undefined:card.face}
    jokerFace={isResolvedJoker(card.face)?card.face:undefined} physicalId={card.id}
    highlight={selected?'gold':null} activeHandShell tier="large" faceFillPx={48}
    style={{width:48,height:68}}/>;
}
function Contents({scene}:{scene:Scene}) {
  const savedKey=`canasta-review/1/${scene}`;
  const [saved]=useState<{view:Fixture;deadline:number}|null>(()=>{
    try{return JSON.parse(sessionStorage.getItem(savedKey)??'null');}catch{return null;}
  });
  const [view,setView]=useState<Fixture>(()=>saved?.view??fixture(scene));
  const [selected,setSelected]=useState<string[]>([]);
  const [drafts,setDrafts]=useState<Meld[]>([]);
  const [rank,setRank]=useState<Rank>('Q');
  const [sorted,setSorted]=useState(false);
  const [filter,setFilter]=useState('all');
  const [discard,setDiscard]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<ShellTabId>('cards');
  const [pane,setPane]=useState<'hand'|'melds'|'finish'>('hand');
  const [seconds,setSeconds]=useState(120);
  const [paused,setPaused]=useState(false);
  const deadline=useRef(saved?.deadline??Date.now()+120000);
  useEffect(()=>{sessionStorage.setItem(savedKey,JSON.stringify({view,deadline:deadline.current}));},[savedKey,view]);
  const transport=useCardTransport();
  const announcements=useAnnouncements();
  const announcementRef=useRef(announcements);announcementRef.current=announcements;
  const anchors=useSeatAnchors();
  const layer=useCanonicalFeltInteractionLayerElement(true);
  const [area,setArea]=useState<Rect>({x:.5,y:.5,width:0,height:0});
  useShellTabBar({cardsIcon:'spade',activeTab:tab,setActiveTab:setTab});
  useShellTimer({secondsRemaining:seconds,totalSeconds:120,paused,actorLabel:'Your turn',identityKey:`review-${scene}`});
  useEffect(()=>{
    const id=setInterval(()=>{const left=Math.max(0,Math.ceil((deadline.current-Date.now())/1000));setSeconds(left);if(!left)setPaused(true);},500);
    return()=>clearInterval(id);
  },[]);
  useEffect(()=>{
    const id=`canasta-review-${scene}-${view.revision}`;
    announcementRef.current.emit({id,type:'gameplay_notice',behavior:'ambient',scope:{dealerGameId:null,roundId:null},
      payload:{title:view.phase==='ended'?'Hand complete':view.notice}});
    return()=>announcementRef.current.dismiss(id);
  },[scene,view.revision,view.notice,view.phase]);
  useLayoutEffect(()=>{
    if(!layer)return;
    const root=layer.closest('[data-canonical-shell-root]')!;
    const nodes=[...root.querySelectorAll<HTMLElement>('[data-canonical-felt-plate], [data-canonical-seat-cluster]')]
      .filter(n=>!n.closest('[data-canonical-shell-viewer-chip-endpoint]'));
    const measure=()=>{
      const f=layer.getBoundingClientRect();if(!f.width||!f.height)return;
      const reserved=nodes.map(n=>n.getBoundingClientRect()).map(r=>({x:(r.x-f.x)/f.width,y:(r.y-f.y)/f.height,width:r.width/f.width,height:r.height/f.height}));
      const next=safeFeltRect(reserved,f.width/f.height);
      setArea(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    const ro=new ResizeObserver(measure);ro.observe(layer);nodes.forEach(n=>ro.observe(n));measure();
    return()=>ro.disconnect();
  },[layer]);
  const report=openingReport(drafts,view.score);
  const used=new Set(drafts.flatMap(m=>m.cards.map(c=>c.id)));
  const ordered=sorted?[...view.hand].sort(compareCards):view.hand;
  const hand=ordered.filter(c=>filter==='all'||(filter==='wild'?(isResolvedJoker(c.face)||standard(c)?.rank==='2'):standard(c)?.rank===filter));
  const ready=view.phase!=='ended'&&!paused;
  function clear(){setSelected([]);setDrafts([]);setDiscard(null);setMessage('Draft cleared. Committed draw or pickup is unchanged.');}
  function assign(){
    const cards=view.hand.filter(c=>selected.includes(c.id));
    if(!cards.length){setMessage('Select cards in your hand first.');return;}
    // Selection moves physical cards between drafts; no duplicate allocation.
    const next=drafts.map(m=>({...m,cards:m.cards.filter(c=>!selected.includes(c.id))})).filter(m=>m.cards.length);
    const target=next.find(m=>m.rank===rank);
    if(target)target.cards=[...target.cards,...cards];else next.push({rank,cards});
    setDrafts(next);setSelected([]);setDiscard(null);setMessage(`Draft ${rank} updated. Nothing submitted.`);
  }
  function fly(card:PhysicalCard,from:'discard'|'hand',to:'discard'|'hand'){
    const endpoint=(kind:'discard'|'hand')=>kind==='hand'?{kind,playerId:SELF} as const:{kind} as const;
    const flightId=`review-${scene}-${view.revision}-${card.id}-${from}-${to}`;
    const accepted=transport?.dispatch({id:flightId,cardId:card.id,
      handContextId:`review-${scene}`,face:'visible',from:endpoint(from),to:endpoint(to),durationMs:300,
      ...(isResolvedJoker(card.face)?{jokerFace:card.face}:{visibleFace:resolveTransportCardFace(card.face)!})});
    if(accepted){platformAudio.unlock(true);const now=performance.now();platformAudio.follow({
      userId:SELF,id:`review-swoosh:${flightId}`,startedAt:now,expiresAt:now+100,cueAt:cardSwooshCueAt});}
  }
  function pickup(){
    const top=view.pile.at(-1);if(!top)return;
    const q=view.hand.filter(c=>selected.includes(c.id));
    const opening=[...drafts.filter(m=>m.rank!==standard(top)?.rank),
      {rank:standard(top)!.rank,cards:[...(drafts.find(m=>m.rank===standard(top)?.rank)?.cards??q),top]}];
    const error=pickupError({hand:view.hand,pile:view.pile,opened:view.opened,score:view.score,existing:view.melds,qualifierIds:selected,opening});
    if(error){setMessage(error);return;}
    const committed=view.opened?[{rank:standard(top)!.rank,cards:[...q,top]}]:opening;
    const removed=new Set(committed.flatMap(m=>m.cards.map(c=>c.id)));
    const next={...view,opened:true,phase:'meld' as const,revision:view.revision+1,
      drawSource:'pile' as const,
      melds:[...view.melds,...committed],pile:[],
      hand:[...view.hand.filter(c=>!removed.has(c.id)),...view.pile.slice(0,-1).filter(c=>!redThree(c))],
      notice:'Pickup committed. Arrange melds, then choose a discard.'};
    fly(view.pile[0],'discard','hand');setView(next);clear();setMessage('Pickup committed. Reconnect keeps these cards.');
  }
  function finish(noDiscard=false){
    if(view.phase==='draw'){setMessage('Draw or qualify the discard pile first.');return;}
    const plan=turnPlan({hand:view.hand,existing:view.melds,drafts,discardId:noDiscard?null:discard,opened:view.opened,score:view.score,drawSource:view.drawSource});
    const {error,melds:merged,remaining:remain,out}=plan;
    if(error){setMessage(error);return;}
    const card=view.hand.find(c=>c.id===discard);
    if(card&&!noDiscard)fly(card,'hand','discard');
    setView({...view,hand:remain,melds:merged,pile:card&&!noDiscard?[...view.pile,card]:view.pile,
      phase:out?'ended':'meld',opened:view.opened||drafts.length>0,revision:view.revision+1,
      notice:out?'Legal going out · hand result fixture':'Turn submitted · opponent turn fixture'});
    clear();setPaused(true);setMessage('Committed fixture response. This review does not run a live match.');
  }
  const controls=<div className="canasta-workspace">
    <nav className="canasta-workspace-nav" aria-label="Arrange hand">
      <button onClick={()=>setPane('hand')} aria-pressed={pane==='hand'}>Hand {view.hand.length}</button>
      <button onClick={()=>setPane('melds')} aria-pressed={pane==='melds'}>Melds {drafts.length}</button>
      <button onClick={()=>setPane('finish')} aria-pressed={pane==='finish'}>Finish</button>
      <button onClick={()=>setSorted(v=>!v)} aria-pressed={sorted}>Sort</button>
    </nav>
    <div className="canasta-pane-scroll">
      <div role="status" className="canasta-feedback">{message||view.notice}</div>
      {pane==='hand'?<>
        <label className="canasta-filter">Show <select aria-label="Hand rank filter" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All {view.hand.length} cards</option><option value="wild">Wild cards</option>
          {['A','3','4','5','6','7','8','9','10','J','Q','K'].map(r=><option key={r}>{r}</option>)}
        </select><span>{selected.length} selected</span></label>
        <div className="canasta-hand-grid" data-card-anchor={`hand-${SELF}`} aria-label="Your physical cards">
          {hand.map(c=><button key={c.id} className="canasta-card" data-physical-id={c.id}
            aria-label={`${physicalCardLabel(c)} copy ${c.id}`} aria-pressed={selected.includes(c.id)}
            disabled={!ready} onClick={()=>setSelected(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id])}>
            <Face card={c} selected={selected.includes(c.id)}/>
            <span>{used.has(c.id)?`→ ${drafts.find(m=>m.cards.some(x=>x.id===c.id))?.rank}`:discard===c.id?'Discard':selected.includes(c.id)?'Selected':'Select'}</span>
          </button>)}
        </div>
      </>:pane==='melds'?<>
        <p>Opening: <strong>{report.count} / {report.required}</strong> · {view.opened?'Already opened':'Bonuses excluded'}</p>
        {report.error&&<p role="alert">{report.error}</p>}
        {drafts.map(m=><article className="canasta-draft" key={m.rank}><strong>{m.rank} · {m.cards.length} cards</strong>
          <div className="canasta-draft-cards">{m.cards.map(c=><button key={c.id} onClick={()=>{setSelected([c.id]);setPane('hand');}}
            aria-label={`Reassign ${physicalCardLabel(c)}`}><Face card={c}/></button>)}</div>
          <p>{meldError(m)??'Valid draft group'}</p>
        </article>)}
        {!drafts.length&&<p>Select cards in Hand, choose a rank below, and add them to a draft.</p>}
      </>:<>
        <p>Canastas: {canastas(view.melds)} committed · two required to go out.</p>
        <p>Discard: {view.hand.find(c=>c.id===discard)?physicalCardLabel(view.hand.find(c=>c.id===discard)!):'Choose one card in Hand, then Set discard.'}</p>
        <div className="canasta-actions"><button disabled={!ready} onClick={()=>finish()}>Submit turn</button>
          <button disabled={!ready} onClick={()=>finish(true)}>Go out without discard</button></div>
        <button onClick={()=>{const snapshot=JSON.parse(sessionStorage.getItem(savedKey)!);setView(snapshot.view);deadline.current=snapshot.deadline;clear();setMessage(`Reconnected to committed revision ${snapshot.view.revision}. ${snapshot.view.hand.length} cards; draft discarded.`);}}>Reconnect</button>
        <p>Committed actions remain. Unsubmitted arrangements are local drafts.</p>
      </>}
    </div>
    <div className="canasta-compose">
      <label>Rank <select value={rank} aria-label="Draft meld rank" onChange={e=>setRank(e.target.value as Rank)}>
        {['A','4','5','6','7','8','9','10','J','Q','K','3'].map(r=><option key={r}>{r}</option>)}
      </select></label>
      <button disabled={!ready} onClick={assign}>Add {selected.length||''}</button>
      <button disabled={!ready} onClick={()=>{if(selected.length!==1){setMessage('Select exactly one discard.');return;}setDiscard(selected[0]);setSelected([]);setPane('finish');}}>Set discard</button>
      <button onClick={clear}>Clear</button>
      <button onClick={()=>{setView(fixture(scene));deadline.current=Date.now()+120000;setPaused(false);setSeconds(120);clear();}}>Reset fixture</button>
    </div>
  </div>;
  return <>
    <div className="canasta-play"><div className="canasta-seats">
      <CanonicalSeatCluster slot={anchors.byPosition.get(5)?.slot} position={5} name="Opponent"
        chipValue="100" chipAmount={100} playerId={OTHER} ownerLabel="CanastaReview" scoreLine="1,240"/>
    </div></div>
    {layer&&area.width>0&&createPortal(<div className="canasta-felt" style={{left:`${area.x*100}%`,top:`${area.y*100}%`,width:`${area.width*100}%`,height:`${area.height*100}%`}}>
      <div className="canasta-piles">
        <div><PlayingCard isHidden style={{width:48,height:68}}/><small>Stock</small></div>
        <button data-card-anchor="discard" disabled={view.phase!=='draw'||!ready} onClick={pickup} aria-label="Take discard pile">
          {view.pile.at(-1)?<Face card={view.pile.at(-1)!}/>:<span className="canasta-empty">Empty</span>}
          <small>{view.pile.length} · {scene==='frozen'&&view.pile.length?'Frozen':'Pile'}</small>
        </button>
      </div>
      <div className="canasta-meld-summary">{view.melds.length?view.melds.map(m=><span key={m.rank}>{m.rank} × {m.cards.length}{m.cards.length>=7?' ★':''}</span>):<span>No committed melds</span>}</div>
      {view.phase==='draw'&&<p>Select a natural pair and tap the pile.</p>}
    </div>,layer)}
    <ShellHudGrid timer={<ShellTimerRail/>} pane={tab==='cards'?controls:<div className="canasta-pane-scroll">Offline {tab} fixture · no session data.</div>}
      identity={<div className="canasta-identity"><strong>You</strong><CanonicalChipDisc amount={100} positionAnchor={1} size="cluster"/><span>Score {view.score.toLocaleString()}</span></div>}/>
  </>;
}
function App(){
  const [scene,setScene]=useState<Scene>('15');
  const [muted,setMuted]=useState(false);
  useEffect(()=>{const stop=platformAudio.install();platformAudio.setUser(SELF);return()=>{platformAudio.setUser(null);stop();};},[]);
  useEffect(()=>platformAudio.setPreference(SELF,!muted),[muted]);
  return <VisualPreferencesProvider userId={null}><ResponsiveGeometryProvider>
    <PersistentTableShell gameType="canasta" anteAmount={10} projectionMode="active-canonical"
      viewerPosition={1} viewerUserId={SELF} seats={[{position:1,occupied:true},{position:5,occupied:true}]}
      header={<header className="canasta-header"><strong>Canasta</strong><label><button aria-label="Mute review audio" aria-pressed={muted} onClick={()=>setMuted(v=>!v)}>{muted?'Muted':'Sound'}</button>
        <select aria-label="Review scenario" value={scene} onChange={e=>setScene(e.target.value as Scene)}>
          {SCENES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
        </select></label></header>}>
      <Contents key={scene} scene={scene}/>
    </PersistentTableShell>
  </ResponsiveGeometryProvider></VisualPreferencesProvider>;
}
document.documentElement.classList.add('dark');
const root=createRoot(document.getElementById('root')!);
root.render(<App/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
