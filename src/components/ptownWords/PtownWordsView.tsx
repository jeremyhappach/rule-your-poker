import {draftPrefix,draftIdentity,restoreDraft} from '@/lib/delayed/drafts';
import {nextDraftSquare} from '@/lib/ptownWords/draftDirection';
import {useWordScorePresentation} from '@/lib/ptownWords/useWordScorePresentation';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {CircleHelp,RefreshCw,Pause,Play,X} from 'lucide-react';
import {premiumAt,type Intent,type Placement,type WordsSnapshot} from '@/lib/ptownWords/model';
import {boardTapGate,wordPresentation,wordSquares,visibleBoard} from '@/lib/ptownWords/presentation';
import {shuffleRack,isInvalidWord} from '@/lib/ptownWords/rackPresentation';
import './ptownWords.css';
interface Props {onMovePresentationComplete?:(playerId:string)=>void;navigation?:ReactNode;asyncDraftUserId?:string;view:WordsSnapshot;now:number;pending:boolean;connected:boolean;error:string;errorVersion?:number;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;panel:ReactNode;sessionEnded:boolean;onIntent:(intent:Intent)=>Promise<boolean>;onReconnect:()=>unknown;balance?:(id:string)=>ReactNode;onPause?:()=>unknown;pausePending?:boolean}
export function PtownWordsRulesLabel(){return <><CircleHelp size={19} aria-hidden="true"/><span className="sr-only">Rules</span></>;}
export function PtownWordsView({view:authoritative,now,pending,connected,error,errorVersion=0,activeTab,setActiveTab,panel,sessionEnded,onIntent,onReconnect,balance,onPause,pausePending=false,asyncDraftUserId,navigation,onMovePresentationComplete}:Props){
 const {visual:v,frame:scoreMotion}=useWordScorePresentation(authoritative,now,!!asyncDraftUserId,onMovePresentationComplete);
 const [zoom,setZoom]=useState(0),[center,setCenter]=useState(112),[selected,setSelected]=useState<number|null>(null),[draft,setDraft]=useState<Placement[]>([]),[dialog,setDialog]=useState<'blank'|'pass'|'exchange'|null>(null),[blankSquare,setBlankSquare]=useState(112),[exchanges,setExchanges]=useState<number[]>([]);
 const [rackOrder,setRackOrder]=useState<number[]>([]),[invalid,setInvalid]=useState(false);
 const dialogReturnFocus=useRef<HTMLElement|null>(null);
 const openDialog=(next:'blank'|'pass'|'exchange')=>{dialogReturnFocus.current=document.activeElement as HTMLElement;setDialog(next);};
 const rack=[...v.rack].sort((a,b)=>{const rank=(id:number)=>{const i=rackOrder.indexOf(id);return i<0?rackOrder.length+v.rack.findIndex(t=>t.id===id):i;};return rank(a.id)-rank(b.id);});
 useEffect(()=>{if(!isInvalidWord(error)){setInvalid(false);return;}setInvalid(true);const timer=setTimeout(()=>setInvalid(false),1500);return()=>clearTimeout(timer);},[error,errorVersion]);
 const viewport=useRef<HTMLDivElement>(null),gesture=useRef({x:0,y:0,moved:false});
 const presentation=wordPresentation(v,now),[focusCell,setFocusCell]=useState<number|null>(null),[focusTarget,setFocusTarget]=useState<{row:number;col:number}|null>(null);
 const camera=useRef<{zoom:number;center:number;x:number;y:number}|null>(null);
 const taps=useMemo(()=>boardTapGate(square=>{setCenter(square);setZoom(level=>Math.min(2,level+1));},square=>{setCenter(square);setZoom(level=>Math.max(0,level-1));}),[]);
 const shownBoard=visibleBoard(v,now); const highlighted=new Set(presentation?wordSquares(v):[]);
 let lastOwnWord=0;for(let i=v.moves.length-1;i>=0;i--){const move=v.moves[i];if(move.playerId===v.viewerId&&move.action==='place'){lastOwnWord=move.turn;break;}}
 const seenOwnWord=useRef(lastOwnWord);
 const scope=`${v.identity.dealerGameId}:${v.turn}`;
 const draftKey=asyncDraftUserId?draftPrefix+asyncDraftUserId+':'+v.identity.dealerGameId:null;
 const draftScope=draftKey?draftIdentity(v):scope,skipSave=useRef(false);
 useEffect(()=>{if(!draftKey)return;skipSave.current=true;try{setDraft(restoreDraft(localStorage.getItem(draftKey),v));}catch{setDraft([]);}},[draftKey,draftScope]);
 useEffect(()=>{if(!draftKey)return;if(skipSave.current){skipSave.current=false;return;}try{if(v.phase==='complete'||!v.canAct||!draft.length)localStorage.removeItem(draftKey);else localStorage.setItem(draftKey,JSON.stringify({identity:draftScope,placements:draft}));}catch{/* Drafts remain editable if storage is unavailable. */}},[draftKey,draftScope,draft,v.phase,v.canAct]);
 useEffect(()=>{if(!draftKey)setDraft([]);setSelected(null);setDialog(null);setExchanges([]);setInvalid(false);},[scope]);
 useLayoutEffect(()=>{
  if(lastOwnWord<=seenOwnWord.current)return;seenOwnWord.current=lastOwnWord;taps.cancel();
  // Acceptance can arrive by command reply or realtime/reconnect. If an opponent
  // reveal has already caught up, change its restoration target, not its focus.
  camera.current=presentation?.opponent?{zoom:0,center:112,x:0,y:0}:null;
  if(!presentation?.opponent){setZoom(0);setFocusCell(null);setFocusTarget(null);}
 },[lastOwnWord,taps,presentation?.opponent]);
 useLayoutEffect(()=>{
  const box=viewport.current;if(!zoom||!box)return;
  const stride=()=>((box.firstElementChild?.firstElementChild as HTMLElement)?.getBoundingClientRect().width||focusCell||48)+1;
  let previousStride=stride(),width=box.clientWidth,height=box.clientHeight;
  const focus=(row:number,col:number)=>{const step=stride();box.scrollLeft=(col+.5)*step-box.clientWidth/2;box.scrollTop=(row+.5)*step-box.clientHeight/2;previousStride=step;width=box.clientWidth;height=box.clientHeight;};
  focus(focusTarget?.row??Math.floor(center/15),focusTarget?.col??center%15);
  const observer=new ResizeObserver(()=>{const row=(box.scrollTop+height/2)/previousStride-.5,col=(box.scrollLeft+width/2)/previousStride-.5;focus(row,col);});
  observer.observe(box);return()=>observer.disconnect();
 },[zoom,center,focusCell,focusTarget]);
 useLayoutEffect(()=>{
  const box=viewport.current;if(!box)return;
  if(!presentation?.opponent){if(camera.current){const prior=camera.current;camera.current=null;setFocusCell(null);setFocusTarget(null);setCenter(prior.center);setZoom(prior.zoom);requestAnimationFrame(()=>{box.scrollLeft=prior.x;box.scrollTop=prior.y;});}return;}
  if(!camera.current)camera.current={zoom,center,x:box.scrollLeft,y:box.scrollTop};
  const cells=[...wordSquares(v),...presentation.squares],rows=cells.map(s=>Math.floor(s/15)),cols=cells.map(s=>s%15),minR=Math.min(...rows),maxR=Math.max(...rows),minC=Math.min(...cols),maxC=Math.max(...cols);
  const focus=()=>{setFocusCell(Math.max(10,Math.min(48,Math.floor(Math.min((box.clientWidth-4)/(maxC-minC+1),(box.clientHeight-4)/(maxR-minR+1)))-1)));setFocusTarget({row:(minR+maxR)/2,col:(minC+maxC)/2});setZoom(2);};
  focus();const observer=new ResizeObserver(focus);observer.observe(box);return()=>observer.disconnect();
 },[presentation?.id,presentation?.opponent]);
 const editable=v.canAct&&!presentation&&!scoreMotion&&!v.paused&&!pending&&(connected||!!asyncDraftUserId)&&now<v.deadline&&v.phase==='playing'&&!sessionEnded;
 useEffect(()=>{taps.cancel();return taps.cancel;},[taps,scope,editable,selected,zoom,draft,dialog]);
 useEffect(()=>{if(v.paused){setDialog(null);setSelected(null);taps.cancel();}},[v.paused,taps]);
 const host=v.hostUserId===v.players.find(p=>p.id===v.viewerId)?.userId;
 const cancelRequest=!host&&!v.paused&&v.pauseRequest?.playerId===v.viewerId;
 const banks=Array.from({length:v.rules.timeBankUses??0},(_,slot)=>slot).filter(slot=>!v.timeBankSpent?.[v.viewerId]?.includes(slot));
 const used=new Set(draft.map(p=>p.tileId)),actor=v.players.find(p=>p.id===v.activePlayerId),left=Math.max(0,Math.ceil((v.deadline-(presentation?presentation.readyAt:v.paused?v.pausedAt??now:now))/1000));
 const send=async(intent:Intent)=>{setDialog(null);if(await onIntent(intent)){setDraft([]);setSelected(null);}};
 const place=(square:number)=>{
  if(gesture.current.moved||v.paused)return;
  if(!editable)return;const existing=draft.find(p=>p.square===square);if(existing){setDraft(d=>d.filter(p=>p.square!==square));setSelected(existing.tileId);return;}
  if(v.board[square]||selected===null)return;const tile=v.rack.find(t=>t.id===selected);if(!tile)return;
  if(tile.face==='?'){setBlankSquare(square);openDialog('blank');return;}
  setDraft(d=>[...d,{tileId:tile.id,square,letter:tile.face}]);setSelected(null);
 };
 const text=error.replace(/^.*ptown_words:/,'').replace('invalid_word:', 'Not in ENABLE2K: ').replace(/_/g,' ');
 const scores=<div className="words-scores">{v.players.map(p=><div key={p.id} data-score-player={p.id} data-active={p.id===(scoreMotion?.playerId??presentation?.playerId??v.activePlayerId)&&v.phase==='playing'}><span>{p.id===v.viewerId?'You':p.name}</span><strong>{scoreMotion?.playerId===p.id?scoreMotion.score:v.scores[p.id]??0}</strong>{scoreMotion?.playerId===p.id&&scoreMotion.phase!=='reveal'&&<span className="words-score-plus" aria-hidden="true" data-phase={scoreMotion.phase} style={{'--score-progress':scoreMotion.progress} as CSSProperties}>+{scoreMotion.points}</span>}{balance?.(p.id)}</div>)}</div>;
 const actions=sessionEnded?<span>Session ended</span>:v.phase==='complete'&&!presentation?<div className="words-result"><strong>{v.terminal?.winnerIds.map(id=>v.players.find(p=>p.id===id)?.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong>{!asyncDraftUserId&&<span>Final rack deductions applied</span>}</div>:<div className="words-player" data-canonical-felt-interaction-layer="">
  <div className="words-status"><strong className={editable?'words-your-turn':undefined}>{v.paused?'Paused':presentation?`${v.players.find(p=>p.id===presentation.playerId)?.name??'Player'} played`:v.canAct?'Your turn':`${actor?.name??'Opponent'}’s turn`}</strong>{v.canAct&&<button className="words-rumble" aria-label="Shuffle rack" title="Shuffle rack" disabled={!editable} onClick={()=>setRackOrder(shuffleRack(rack.map(t=>t.id)))}><RefreshCw size={16} aria-hidden="true"/></button>}<div className="words-clock"><time>{asyncDraftUserId?Math.floor(left/3600)+'h '+Math.floor(left%3600/60)+'m':Math.floor(left/60)+':'+String(left%60).padStart(2,'0')}</time>{banks.map(slot=><button key={slot} className="words-bank" aria-label={'Use time bank '+(slot+1)+': add 3 minutes'} disabled={!editable} onClick={()=>void onIntent({type:'time_bank',items:[{slot}]})}>+3m</button>)}</div>{!asyncDraftUserId&&!!v.rules.timeBankUses&&<button className="words-pause" data-cancel-request={cancelRequest||undefined} aria-label={cancelRequest?'Cancel pause request':v.paused?'Resume game':host?'Pause game':'Request pause'} title={cancelRequest?'Cancel pause request':v.paused?'Resume':host?'Pause':'Request pause'} disabled={pending||pausePending||!connected||(v.paused&&!host)||(!host&&!!v.pauseRequest&&!cancelRequest)||v.phase!=='playing'} onClick={()=>host?onPause?.():void onIntent(cancelRequest?{type:'cancel_pause_request',items:[{requestId:v.pauseRequest!.id}]}:{type:'request_pause'})}>{cancelRequest?<X size={18}/>:v.paused?<Play size={18}/>:<Pause size={18}/>}</button>}<span>{v.bagCount} in bag</span></div>
  <div className="words-rack" data-concealed={v.paused} data-actionable={editable} aria-label="Your private rack">{rack.map(tile=><button key={tile.id} data-tile-id={tile.id} aria-label={v.paused?'Concealed tile':`${tile.face==='?'?'Blank':tile.face}, ${tile.value} points`} aria-pressed={selected===tile.id} data-used={used.has(tile.id)} disabled={!editable||used.has(tile.id)} onClick={()=>{taps.cancel();if(selected===tile.id){setSelected(null);return;}const square=nextDraftSquare(draft,v.board);if(square===null){setSelected(tile.id);return;}if(tile.face==='?'){setSelected(tile.id);setBlankSquare(square);openDialog('blank');}else{setDraft(d=>[...d,{tileId:tile.id,square,letter:tile.face}]);setSelected(null);}}}>{v.paused?'◇':tile.face==='?'?'◇':tile.face}{!v.paused&&<small>{tile.value}</small>}</button>)}</div>
  {draft.length>0&&<button className="words-submit" disabled={!editable||!connected} onClick={()=>void send({type:'place',items:draft})}>{pending?'Submitting…':'Submit Word'}</button>}
  <div className="words-turn-actions">{draft.length>0?<><button disabled={!editable} onClick={()=>setDraft(d=>d.slice(0,-1))}>Undo</button><button disabled={!editable} onClick={()=>{setDraft([]);setSelected(null);}}>Recall</button></>:<><button disabled={!editable||v.bagCount<7} title={v.bagCount<7?'Need 7 in bag':undefined} onClick={()=>{setExchanges([]);openDialog('exchange');}}>Exchange</button><button disabled={!editable} onClick={()=>openDialog('pass')}>Pass</button></>}</div>
  {((error&&!isInvalidWord(error))||!connected)&&<div className="words-error" role="status">{text||'Reconnecting…'}{!connected&&<button onClick={onReconnect}>Reconnect</button>}</div>}
 </div>;
 return <div className="words-host"><FullscreenGameShell navigation={navigation} className="words-shell" title="Ptown Words" description="" activeTab={activeTab} setActiveTab={setActiveTab} sessionLabel={<PtownWordsRulesLabel/>} panelTitle={activeTab==='lobby'?'Rules':undefined} panel={panel} scores={scores} actions={actions} sessionEnded={sessionEnded}>
  {!sessionEnded&&<div className="words-board-region" data-paused={v.paused}>{v.paused&&<div className="words-paused-cover" role="status">Paused{!host&&<small>Waiting for host to resume</small>}</div>}{invalid&&<div className="words-invalid" role="alert">invalid word</div>}<div className="words-navigation" data-canonical-felt-interaction-layer=""><span>{selected!==null?'Tap a square to place your tile':'Tap to zoom in · double tap to zoom out'}</span>{zoom>0&&<button disabled={!!presentation||v.paused} aria-pressed={selected===null} onClick={()=>setSelected(null)}>Inspect</button>}</div>
   <div className={`words-scroll ${zoom?'is-zoom':'is-overview'}`} data-zoom={zoom} ref={viewport} aria-busy={!!presentation} onDoubleClick={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='Escape'&&!presentation&&!v.paused){taps.cancel();setZoom(0);}}} onPointerDown={e=>{gesture.current={x:e.clientX,y:e.clientY,moved:false};}} onPointerMove={e=>{if(Math.hypot(e.clientX-gesture.current.x,e.clientY-gesture.current.y)>8){gesture.current.moved=true;taps.cancel();}}} onScroll={()=>{gesture.current.moved=true;taps.cancel();}}>
    <div className="words-grid" role="grid" aria-label="Ptown Words board" data-canonical-felt-interaction-layer="" style={focusCell?{'--words-focus-cell':`${focusCell}px`} as CSSProperties:undefined}>{v.board.map((committed,square)=>{const stage=v.paused?undefined:draft.find(p=>p.square===square),visible=shownBoard[square],tile=stage?{...v.rack.find(t=>t.id===stage.tileId)!,letter:stage.letter}:visible,premium=premiumAt(square),flipIndex=presentation?.opponent?[...presentation.squares].sort((a,b)=>a-b).indexOf(square):-1,flipping=!!tile&&flipIndex!==undefined&&flipIndex>=0&&presentation!.at<presentation!.startedAt+presentation!.focusMs+(flipIndex+1)*presentation!.flipMs;return <button role="gridcell" key={square} data-square={square} data-word-highlight={highlighted.has(square)||undefined} className={`words-cell ${tile?'has-tile':''} ${stage?'is-staged':''} ${flipping?'is-revealing':''}`} style={flipping?{animationDuration:`${presentation!.flipMs}ms`,animationPlayState:v.paused?'paused':'running'}:undefined} aria-label={`${String.fromCharCode(65+square%15)}${Math.floor(square/15)+1}${tile?` ${tile.letter}, ${tile.value} points`:premium?` ${premium}`:''}`} onClick={e=>{if(presentation||v.paused||(e.detail!==0&&gesture.current.moved))return;if(e.detail===0)gesture.current.moved=false;const tileIntent=selected!==null||!!stage;if(tileIntent){taps.cancel();place(square);return;}if(e.detail===0){gesture.current.moved=false;taps.cancel();setCenter(square);setZoom(level=>Math.min(2,level+1));}else taps.tap(square,e.clientX,e.clientY);}}>{tile?<><b>{tile.letter}</b><small>{tile.value}</small></>:<span className={`words-premium ${premium}`} data-center={square===112}>{square===112?'PT':premium}</span>}</button>;})}</div>
   </div>
   {zoom>0&&<div className="words-pan" data-canonical-felt-interaction-layer="" aria-label="Pan board">{[['←',-144,0],['↑',0,-144],['↓',0,144],['→',144,0]].map(([label,x,y])=><button disabled={!!presentation||v.paused} key={label} aria-label={`Pan ${label}`} onClick={()=>{taps.cancel();viewport.current?.scrollBy({left:Number(x),top:Number(y),behavior:'smooth'});}}>{label}</button>)}</div>}
  </div>}
 </FullscreenGameShell>
 <Dialog open={dialog!==null&&!v.paused} onOpenChange={open=>{if(!open)setDialog(null);}}><DialogContent className="words-dialog" onCloseAutoFocus={e=>{e.preventDefault();dialogReturnFocus.current?.focus();}}><DialogTitle>{dialog==='blank'?'Choose blank letter':dialog==='pass'?'Pass this turn?':'Exchange tiles'}</DialogTitle><DialogDescription>{dialog==='pass'?'Your staged tiles return to your rack.':dialog==='exchange'?'Choose the tiles to exchange.':'The blank always scores zero.'}</DialogDescription>
 {dialog==='blank'?<div className="words-alphabet">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter=><button key={letter} onClick={()=>{if(editable&&selected!==null){setDraft(d=>[...d,{tileId:selected,square:blankSquare,letter}]);setSelected(null);}setDialog(null);}}>{letter}</button>)}</div>:dialog==='exchange'?<><div className="words-exchange">{v.rack.map(tile=><button key={tile.id} aria-label={`${tile.face==='?'?'Blank':tile.face}, ${tile.value} points`} aria-pressed={exchanges.includes(tile.id)} onClick={()=>setExchanges(e=>e.includes(tile.id)?e.filter(id=>id!==tile.id):[...e,tile.id])}>{tile.face==='?'?'◇':tile.face}</button>)}</div><button disabled={!editable||!connected||!exchanges.length} onClick={()=>void send({type:'exchange',items:exchanges.map(tileId=>({tileId}))})}>Exchange {exchanges.length} tiles</button></>:<button disabled={!editable} onClick={()=>void send({type:'pass'})}>Pass turn</button>}
 <button onClick={()=>setDialog(null)}>Cancel</button></DialogContent></Dialog></div>;
}
