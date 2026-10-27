import {useEffect,useRef,useState,type ReactNode} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {premiumAt,type Intent,type Placement,type WordsSnapshot} from '@/lib/ptownWords/model';
import './ptownWords.css';
interface Props {view:WordsSnapshot;now:number;pending:boolean;connected:boolean;error:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;panel:ReactNode;sessionEnded:boolean;onIntent:(intent:Intent)=>Promise<boolean>;onReconnect:()=>unknown;balance?:(id:string)=>ReactNode}
export function PtownWordsView({view:v,now,pending,connected,error,activeTab,setActiveTab,panel,sessionEnded,onIntent,onReconnect,balance}:Props){
 const [zoom,setZoom]=useState(false),[center,setCenter]=useState(112),[selected,setSelected]=useState<number|null>(null),[draft,setDraft]=useState<Placement[]>([]),[dialog,setDialog]=useState<'blank'|'pass'|'exchange'|null>(null),[blankSquare,setBlankSquare]=useState(112),[exchanges,setExchanges]=useState<number[]>([]);
 const viewport=useRef<HTMLDivElement>(null),gesture=useRef({x:0,y:0,moved:false});
 const scope=`${v.identity.dealerGameId}:${v.turn}`;
 useEffect(()=>{setDraft([]);setSelected(null);setDialog(null);setExchanges([]);},[scope]);
 useEffect(()=>{if(zoom&&viewport.current){const box=viewport.current;box.scrollLeft=(center%15)*48-box.clientWidth/2+24;box.scrollTop=Math.floor(center/15)*48-box.clientHeight/2+24;}},[zoom,center]);
 const editable=v.canAct&&!v.paused&&!pending&&connected&&now<v.deadline&&v.phase==='playing'&&!sessionEnded;
 const used=new Set(draft.map(p=>p.tileId)),actor=v.players.find(p=>p.id===v.activePlayerId),left=Math.max(0,Math.ceil((v.deadline-(v.paused?v.pausedAt??now:now))/1000));
 const send=async(intent:Intent)=>{setDialog(null);if(await onIntent(intent)){setDraft([]);setSelected(null);}};
 const place=(square:number)=>{
  if(gesture.current.moved)return;
  if(!zoom){setSelected(null);setCenter(square);setZoom(true);return;}
  if(!editable)return;const existing=draft.find(p=>p.square===square);if(existing){setDraft(d=>d.filter(p=>p.square!==square));setSelected(existing.tileId);return;}
  if(v.board[square]||selected===null)return;const tile=v.rack.find(t=>t.id===selected);if(!tile)return;
  if(tile.face==='?'){setBlankSquare(square);setDialog('blank');return;}
  setDraft(d=>[...d,{tileId:tile.id,square,letter:tile.face}]);setSelected(null);
 };
 const text=error.replace(/^.*ptown_words:/,'').replace('invalid_word:', 'Not in ENABLE2K: ').replace(/_/g,' ');
 const scores=<div className="words-scores">{v.players.map(p=><div key={p.id} data-active={p.id===v.activePlayerId&&v.phase==='playing'}><span>{p.id===v.viewerId?'You':p.name}</span><strong>{v.scores[p.id]??0}</strong>{balance?.(p.id)}</div>)}</div>;
 const actions=sessionEnded?<span>Session ended</span>:v.phase==='complete'?<div className="words-result"><strong>{v.terminal?.winnerIds.map(id=>v.players.find(p=>p.id===id)?.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong><span>Final rack deductions applied</span></div>:<div className="words-player" data-canonical-felt-interaction-layer="">
  <div className="words-status"><strong>{v.paused?'Paused':v.canAct?'Your turn':`${actor?.name??'Opponent'}’s turn`}</strong><time>{Math.floor(left/60)}:{String(left%60).padStart(2,'0')}</time><span>{v.bagCount} in bag</span></div>
  <div className="words-rack" aria-label="Your private rack">{v.rack.map(tile=><button key={tile.id} aria-label={`${tile.face==='?'?'Blank':tile.face}, ${tile.value} points`} aria-pressed={selected===tile.id} data-used={used.has(tile.id)} disabled={!editable||used.has(tile.id)} onClick={()=>{setSelected(selected===tile.id?null:tile.id);if(!zoom){setCenter(112);setZoom(true);}}}>{tile.face==='?'?'◇':tile.face}<small>{tile.value}</small></button>)}</div>
  {draft.length>0&&<><div className="words-edit"><button disabled={!editable} onClick={()=>setDraft(d=>d.slice(0,-1))}>Undo</button><button disabled={!editable} onClick={()=>{setDraft([]);setSelected(null);}}>Recall all</button></div><button className="words-submit" disabled={!editable} onClick={()=>void send({type:'place',items:draft})}>{pending?'Submitting…':'Submit Word'}</button></>}
  <div className="words-turn-actions"><button disabled={!editable} onClick={()=>setDialog('pass')}>Pass</button><button disabled={!editable||v.bagCount<7} title={v.bagCount<7?'Need 7 in bag':undefined} onClick={()=>{setExchanges([]);setDialog('exchange');}}>Exchange</button></div>
  {(error||!connected)&&<div className="words-error" role="status">{text||'Reconnecting…'}{!connected&&<button onClick={onReconnect}>Reconnect</button>}</div>}
 </div>;
 return <div className="words-host"><FullscreenGameShell className="words-shell" title="Ptown Words" description="" activeTab={activeTab} setActiveTab={setActiveTab} panel={panel} scores={scores} actions={actions} sessionEnded={sessionEnded}>
  {!sessionEnded&&<div className="words-board-region"><div className="words-navigation" data-canonical-felt-interaction-layer=""><span>{zoom?'Board detail':'Full board · 15 × 15'}</span><button onClick={()=>{setSelected(null);if(zoom)setZoom(false);else{setCenter(112);setZoom(true);}}}>{zoom?'Zoom Out':'Zoom In'}</button>{zoom&&<button aria-pressed={selected===null} onClick={()=>setSelected(null)}>Inspect</button>}</div>
   <div className={`words-scroll ${zoom?'is-zoom':'is-overview'}`} ref={viewport} onPointerDown={e=>{gesture.current={x:e.clientX,y:e.clientY,moved:false};}} onPointerMove={e=>{if(Math.hypot(e.clientX-gesture.current.x,e.clientY-gesture.current.y)>8)gesture.current.moved=true;}} onScroll={()=>{gesture.current.moved=true;}}>
    <div className="words-grid" role="grid" aria-label="Ptown Words board" data-canonical-felt-interaction-layer="">{v.board.map((committed,square)=>{const stage=draft.find(p=>p.square===square),tile=stage?{...v.rack.find(t=>t.id===stage.tileId)!,letter:stage.letter}:committed,premium=premiumAt(square);return <button role="gridcell" key={square} data-square={square} className={`words-cell ${tile?'has-tile':''} ${stage?'is-staged':''}`} aria-label={`${String.fromCharCode(65+square%15)}${Math.floor(square/15)+1}${tile?` ${tile.letter}, ${tile.value} points`:premium?` ${premium}`:''}`} onClick={()=>place(square)}>{tile?<><b>{tile.letter}</b><small>{tile.value}</small></>:<span className={`words-premium ${premium}`} data-center={square===112}>{square===112?'PT':premium}</span>}</button>;})}</div>
   </div>
   {zoom&&<div className="words-pan" data-canonical-felt-interaction-layer="" aria-label="Pan board">{[['←',-144,0],['↑',0,-144],['↓',0,144],['→',144,0]].map(([label,x,y])=><button key={label} aria-label={`Pan ${label}`} onClick={()=>{setSelected(null);viewport.current?.scrollBy({left:Number(x),top:Number(y),behavior:'smooth'});}}>{label}</button>)}</div>}
  </div>}
 </FullscreenGameShell>
 <Dialog open={dialog!==null} onOpenChange={open=>{if(!open)setDialog(null);}}><DialogContent className="words-dialog"><DialogTitle>{dialog==='blank'?'Choose blank letter':dialog==='pass'?'Pass this turn?':'Exchange tiles'}</DialogTitle><DialogDescription>{dialog==='pass'?'Your staged tiles return to your rack.':dialog==='exchange'?'Choose the tiles to exchange.':'The blank always scores zero.'}</DialogDescription>
 {dialog==='blank'?<div className="words-alphabet">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter=><button key={letter} onClick={()=>{if(editable&&selected!==null){setDraft(d=>[...d,{tileId:selected,square:blankSquare,letter}]);setSelected(null);}setDialog(null);}}>{letter}</button>)}</div>:dialog==='exchange'?<><div className="words-exchange">{v.rack.map(tile=><button key={tile.id} aria-pressed={exchanges.includes(tile.id)} onClick={()=>setExchanges(e=>e.includes(tile.id)?e.filter(id=>id!==tile.id):[...e,tile.id])}>{tile.face==='?'?'◇':tile.face}</button>)}</div><button disabled={!editable||!exchanges.length} onClick={()=>void send({type:'exchange',items:exchanges.map(tileId=>({tileId}))})}>Exchange {exchanges.length} tiles</button></>:<button disabled={!editable} onClick={()=>void send({type:'pass'})}>Pass turn</button>}
 <button onClick={()=>setDialog(null)}>Cancel</button></DialogContent></Dialog></div>;
}
