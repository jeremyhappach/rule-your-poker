import {turnBudget} from '@/lib/canasta/config';
import {subscribeAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
import {pickupGroups} from '@/lib/canasta/guidance';
import {useCallback,useEffect,useRef,useState} from 'react';
import {HandEditor,type EditorView} from './HandEditor';
import {acceptSnapshot,commandFor,CommandRejected,type Transport,type Snapshot} from '@/lib/canasta/client';
import type {Action,Command} from '@/lib/canasta/engine';
import {standard,type Meld} from '@/lib/canasta/rules';
import type {Rank} from '@/lib/cardUtils';
import {ShellTimerRail,useShellTimer} from '@/lib/canonicalShell/ShellTimerRail';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import './canasta.css';

/** Gameplay contents only; the route owns the canonical table, identity and terminal lifecycle. */
export function CanastaGame({transport,identity,onSnapshot,panel,ended=false,helpers=true,onHelpersChange,pileTarget}:{transport:Transport;identity:React.ReactNode;onSnapshot:(snapshot:Snapshot)=>void;panel?:React.ReactNode;ended?:boolean;helpers?:boolean;onHelpersChange?:(value:boolean)=>void;pileTarget?:HTMLElement|null}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),current=useRef<Snapshot|null>(null);
  const [error,setError]=useState(''),[pending,setPending]=useState(false),retry=useRef<Command|null>(null),busy=useRef(false);
  const [selected,setSelected]=useState<string[]>([]),[drafts,setDrafts]=useState<Meld[]>([]),[discard,setDiscard]=useState<string|null>(null);
  const [rank,setRank]=useState<Rank>('A'),[now,setNow]=useState(Date.now());
  const serverOffset=useRef(0),observe=useRef(onSnapshot);observe.current=onSnapshot;
  const mounted=useRef(false);
  const clear=useCallback(()=>{setSelected([]);setDrafts([]);setDiscard(null);},[]);
  const receive=useCallback((s:Snapshot)=>{if(!mounted.current)return;const next=acceptSnapshot(current.current,s);if(next===current.current)return;current.current=next;serverOffset.current=next.serverAt-Date.now();setNow(next.serverAt);setSnapshot(next);observe.current(next);},[]);
  const refresh=useCallback(async()=>{try{receive(await transport.load());setError('');}catch(e){setError(e instanceof Error?e.message:'Connection uncertain');}},[receive,transport]);
  useEffect(()=>{mounted.current=true;let live=true;const refreshLive=()=>{if(live)void refresh();};const stop=transport.subscribe(refreshLive);refreshLive();
    const stopRecovery=subscribeAuthoritativeRecoverySnapshot(refreshLive);
    const pausedCheck=setInterval(()=>{if(current.current?.state.pause&&!document.hidden&&navigator.onLine)refreshLive();},5000);
    return()=>{live=false;mounted.current=false;stopRecovery();clearInterval(pausedCheck);stop();};},[transport,refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+serverOffset.current),250);return()=>clearInterval(timer);},[]);
  const s=snapshot?.state,h=s?.hand,p=h&&s?.viewer?h.players[s.viewer]:null;
  const turnKey=h?`${s!.id}:${h.id}:${h.turn}:${h.generation}`:'';
  useEffect(()=>{clear();retry.current=null;},[turnKey,clear]);
  const announcements=useAnnouncements(),announce=useRef(announcements);announce.current=announcements;
  useEffect(()=>{if(!s||!h)return;const id=`canasta:${s.id}:${h.id}:${h.turn}:${h.phase}`;
    announce.current.emit({id,type:'gameplay_notice',behavior:'ambient',scope:{dealerGameId:s.id,roundId:h.id},
      payload:{title:s.pause?'Canasta paused':h.phase==='complete'?'Canasta hand complete':h.active===s.viewer?'Your turn':'Opponent’s turn'}});
    return()=>announce.current.dismiss(id);},[s?.id,s?.pause,h?.id,h?.turn,h?.phase,h?.active,s?.viewer]);
  const seconds=s?.pause?Math.ceil(s.pause.remaining/1000):h?Math.max(0,Math.ceil((h.deadline-now)/1000)):0;
  useShellTimer({activePlayerId:h?.active,secondsRemaining:seconds,totalSeconds:s?turnBudget(s)/1000:120,paused:!!s?.pause||h?.phase==='complete'||ended,actorLabel:h?.active===s?.viewer?'Your turn':'Opponent’s turn',identityKey:turnKey});
  async function send(action:Action){
    if(busy.current||!current.current)return;busy.current=true;setPending(true);
    const command=retry.current??commandFor(current.current.state,action);retry.current=command;
    try{receive(await transport.send(command));retry.current=null;clear();setError('');}
    catch(e){if(e instanceof CommandRejected){retry.current=null;setError(e.message);}else setError((e instanceof Error?e.message:'Connection uncertain')+'. Reconnect before another action.');}
    finally{busy.current=false;setPending(false);}
  }
  async function reconnect(){
    clear();if(retry.current){await send(retry.current.action);if(retry.current)return;}await refresh();
  }
  if(!s||!h||!p?.cards)return <ShellHudGrid timer={<ShellTimerRail/>} pane={panel??<button onClick={()=>void refresh()}>{error||(s?.viewer===null?'Watching Canasta':'Loading Canasta…')}</button>} identity={identity}/>;
  const ready=!pending&&!retry.current&&!s.pause&&!s.winner&&!s.automatic.includes(s.viewer!)&&h.active===s.viewer&&h.phase!=='complete'&&seconds>0;
  const view:EditorView={hand:p.cards,pile:h.pile,melds:p.melds,reds:p.reds,opponentMelds:s.seats.filter(seat=>seat.id!==s.viewer).flatMap(seat=>h.players[seat.id].melds),score:p.openingScore,opened:p.opened,stockCount:h.stockCount,pileCount:h.pileCount,pileFrozen:h.pileFrozen,source:h.source,version:s.version,
    phase:h.phase==='complete'?'ended':h.phase,notice:s.pause?'Paused · your committed cards are preserved.':s.automatic.includes(s.viewer!)?'Auto-play is on. Uncheck it to take control.':h.active===s.viewer?'Your turn':'Opponent’s turn.'};
  const hand=p.cards;
  function assign(target:Rank=rank){
    const cards=p!.cards!.filter(c=>selected.includes(c.id)),next=drafts.map(g=>({...g,cards:g.cards.filter(c=>!selected.includes(c.id))})).filter(g=>g.cards.length);
    if(!cards.length)return;const group=next.find(g=>g.rank===target);if(group)group.cards.push(...cards);else next.push({rank:target,cards});setDrafts(next);setSelected([]);setDiscard(null);
  }
  function pickup(){
    const top=h!.pile.at(-1);if(!top||!standard(top))return;
    const groups=pickupGroups({...view,version:s!.version},selected,drafts);
    void send({type:'pickup',qualifiers:selected,opening:p!.opened?[]:groups.map(g=>({rank:g.rank,ids:g.cards.map(c=>c.id)}))});
  }
  const controls=<HandEditor key={turnKey+':'+(panel?'panel':h.phase==='complete'?'complete':'cards')} pileTarget={pileTarget} release={()=>{setDrafts(drafts.map(g=>({...g,cards:g.cards.filter(c=>!selected.includes(c.id))})).filter(g=>g.cards.length));if(discard&&selected.includes(discard))setDiscard(null);setSelected([]);}} helpers={helpers} onHelpersChange={onHelpersChange} viewerId={s.viewer!} view={view} hand={hand} selected={selected} setSelected={setSelected} drafts={drafts}
    rank={rank} setRank={setRank} discard={discard}
    message={error} ready={ready} clear={clear} assign={assign} setDiscard={()=>{const id=selected[0];setDrafts(drafts.map(g=>({...g,cards:g.cards.filter(c=>c.id!==id)})).filter(g=>g.cards.length));setDiscard(id);setSelected([]);}}
    pickup={pickup} draw={()=>void send({type:h.stockCount?'draw':'end-exhausted'})}
    finish={without=>void send({type:'finish',groups:drafts.map(g=>({rank:g.rank,ids:g.cards.map(c=>c.id)})),discard:without?null:discard})}
    reconnect={()=>void reconnect()} seconds={seconds} paused={!!s.pause}/>;
  const automatic=s.automatic.includes(s.viewer!);
  async function reclaim(){
    if(busy.current||!transport.takeControl)return;busy.current=true;setPending(true);
    try{receive(await transport.takeControl());clear();retry.current=null;setError('');}
    catch(e){setError(e instanceof Error?e.message:'Connection uncertain');}
    finally{busy.current=false;setPending(false);}
  }
  return <ShellHudGrid timer={<ShellTimerRail/>} pane={<>{panel}{!ended&&<div style={{height:'100%',display:panel?'none':'flex',flexDirection:'column'}}>{automatic?<label className="flex min-h-11 items-center justify-center gap-2 text-xs text-amber-600"><input type="checkbox" aria-label="Auto-play" checked disabled={pending||!transport.takeControl} onChange={()=>void reclaim()}/>Auto-play (uncheck to rejoin)</label>:null}{controls}</div>}</>} identity={identity}/>;
}
