import {useCallback,useEffect,useRef,useState} from 'react';
import {HandEditor,type EditorView} from './HandEditor';
import {acceptSnapshot,commandFor,CommandRejected,type Transport,type Snapshot} from '@/lib/canasta/client';
import type {Action,Command} from '@/lib/canasta/engine';
import {compareCards,standard,wild,type Meld} from '@/lib/canasta/rules';
import type {Rank} from '@/lib/cardUtils';
import {ShellTimerRail,useShellTimer} from '@/lib/canonicalShell/ShellTimerRail';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import './canasta.css';

/** Gameplay contents only; the route owns the canonical table, identity and terminal lifecycle. */
export function CanastaGame({transport,identity,onTerminal}:{transport:Transport;identity:React.ReactNode;onTerminal:(snapshot:Snapshot)=>void}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),current=useRef<Snapshot|null>(null);
  const [error,setError]=useState(''),[pending,setPending]=useState(false),retry=useRef<Command|null>(null),busy=useRef(false);
  const [selected,setSelected]=useState<string[]>([]),[drafts,setDrafts]=useState<Meld[]>([]),[discard,setDiscard]=useState<string|null>(null);
  const [rank,setRank]=useState<Rank>('A'),[filter,setFilter]=useState('all'),[sorted,setSorted]=useState(false),[now,setNow]=useState(Date.now());
  const serverOffset=useRef(0),terminal=useRef(onTerminal);terminal.current=onTerminal;
  const clear=useCallback(()=>{setSelected([]);setDrafts([]);setDiscard(null);},[]);
  const receive=useCallback((s:Snapshot)=>{const next=acceptSnapshot(current.current,s);if(next===current.current)return;current.current=next;serverOffset.current=next.serverAt-Date.now();setSnapshot(next);},[]);
  const refresh=useCallback(async()=>{try{receive(await transport.load());setError('');}catch(e){setError(e instanceof Error?e.message:'Connection uncertain');}},[receive,transport]);
  useEffect(()=>{let live=true;const refreshLive=()=>{if(live)void refresh();};const stop=transport.subscribe(refreshLive);refreshLive();
    return()=>{live=false;stop();};},[transport,refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+serverOffset.current),250);return()=>clearInterval(timer);},[]);
  const s=snapshot?.state,h=s?.hand,p=h&&s?.viewer?h.players[s.viewer]:null;
  const turnKey=h?`${s!.id}:${h.id}:${h.turn}:${h.generation}`:'';
  useEffect(()=>{clear();retry.current=null;},[turnKey,clear]);
  useEffect(()=>{if(snapshot?.settlement||snapshot?.finished)terminal.current(snapshot);},[snapshot]);
  const announcements=useAnnouncements(),announce=useRef(announcements);announce.current=announcements;
  useEffect(()=>{if(!s||!h)return;const id=`canasta:${s.id}:${h.id}:${h.turn}:${h.phase}`;
    announce.current.emit({id,type:'gameplay_notice',behavior:'ambient',scope:{dealerGameId:s.id,roundId:h.id},
      payload:{title:s.pause?'Canasta paused':h.phase==='complete'?'Canasta hand complete':h.active===s.viewer?'Your turn':'Opponent’s turn'}});
    return()=>announce.current.dismiss(id);},[s?.id,s?.pause,h?.id,h?.turn,h?.phase,h?.active,s?.viewer]);
  const seconds=h?Math.max(0,Math.ceil((h.deadline-now)/1000)):0;
  useShellTimer({secondsRemaining:seconds,totalSeconds:120,paused:!!s?.pause,actorLabel:h?.active===s?.viewer?'Your turn':'Opponent’s turn',identityKey:turnKey});
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
  if(!s||!h||!p?.cards)return <ShellHudGrid timer={<ShellTimerRail/>} pane={<button onClick={()=>void refresh()}>{error||'Loading Canasta…'}</button>} identity={identity}/>;
  const ready=!pending&&!retry.current&&!s.pause&&!s.winner&&h.active===s.viewer&&h.phase!=='complete'&&seconds>0;
  const view:EditorView={hand:p.cards,pile:h.pile,melds:p.melds,score:p.openingScore,opened:p.opened,stockCount:h.stockCount,
    phase:h.phase==='complete'?'ended':h.phase,notice:h.active===s.viewer?'Draw or take a qualifying pile, then submit your turn.':'Opponent’s turn.'};
  const hand=(sorted?[...p.cards].sort(compareCards):p.cards).filter(c=>filter==='all'||(filter==='wild'?wild(c):standard(c)?.rank===filter));
  function assign(){
    const cards=p!.cards!.filter(c=>selected.includes(c.id)),next=drafts.map(g=>({...g,cards:g.cards.filter(c=>!selected.includes(c.id))})).filter(g=>g.cards.length);
    if(!cards.length)return;const group=next.find(g=>g.rank===rank);if(group)group.cards.push(...cards);else next.push({rank,cards});setDrafts(next);setSelected([]);setDiscard(null);
  }
  function pickup(){
    const top=h!.pile.at(-1);if(!top||!standard(top))return;
    const r=standard(top)!.rank,groups=[...drafts.filter(g=>g.rank!==r),{rank:r,cards:[...(drafts.find(g=>g.rank===r)?.cards??p!.cards!.filter(c=>selected.includes(c.id))),top]}];
    void send({type:'pickup',qualifiers:selected,opening:p!.opened?[]:groups.map(g=>({rank:g.rank,ids:g.cards.map(c=>c.id)}))});
  }
  const controls=<HandEditor viewerId={s.viewer!} view={view} hand={hand} selected={selected} setSelected={setSelected} drafts={drafts}
    rank={rank} setRank={setRank} filter={filter} setFilter={setFilter} sort={()=>setSorted(v=>!v)} sorted={sorted} discard={discard}
    message={error} ready={ready} clear={clear} assign={assign} setDiscard={()=>{setDiscard(selected[0]);setSelected([]);}}
    pickup={pickup} draw={()=>void send({type:h.stockCount?'draw':'end-exhausted'})}
    finish={without=>void send({type:'finish',groups:drafts.map(g=>({rank:g.rank,ids:g.cards.map(c=>c.id)})),discard:without?null:discard})}
    reconnect={()=>void reconnect()} seconds={seconds} paused={!!s.pause}/>;
  return <ShellHudGrid timer={<ShellTimerRail/>} pane={controls} identity={identity}/>;
}
