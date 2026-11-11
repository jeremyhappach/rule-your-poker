import {usePlayback} from '@/lib/delayed/usePlayback';
import {draftPrefix,draftIdentity,restoreDraft} from '@/lib/delayed/drafts';
import {useWordScorePresentation} from '@/lib/ptownWords/useWordScorePresentation';
import {lastScoredWord} from '@/lib/ptownWords/scorePresentation';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {CircleHelp,RefreshCw,Pause,Play,X} from 'lucide-react';
import {premiumAt,type Intent,type Placement,type WordsSnapshot} from '@/lib/ptownWords/model';
import {wordPresentation,wordSquares,visibleBoard} from '@/lib/ptownWords/presentation';
import {shuffleRack,isInvalidWord} from '@/lib/ptownWords/rackPresentation';
import {presentSound} from '@/lib/audio/presentationSound';
import {createPortal} from 'react-dom';
import {useWordsBoardGestures,type DragTile,type DropTarget,type TileOrigin} from './useWordsBoardGestures';
import {fittedBoardSize,focusWord} from './wordsBoardCamera';
import {useWordsCountdown} from './useWordsCountdown';
import './ptownWords.css';
interface Props {reviewPlayerId?:string;readOnly?:boolean;gameplay?:boolean;onMovePresentationComplete?:(playerId:string)=>void;navigation?:ReactNode;asyncDraftUserId?:string;view:WordsSnapshot;now:number;pending:boolean;connected:boolean;error:string;errorVersion?:number;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;panel:ReactNode;sessionEnded:boolean;onIntent:(intent:Intent)=>Promise<boolean>;onReconnect:()=>unknown;balance?:(id:string)=>ReactNode;onPause?:()=>unknown;pausePending?:boolean}
export function PtownWordsRulesLabel(){return <><CircleHelp size={19} aria-hidden="true"/><span className="sr-only">Rules</span></>;}
export function PtownWordsView({reviewPlayerId,readOnly=false,gameplay=true,view:authoritative,now,pending,connected,error,errorVersion=0,activeTab,setActiveTab,panel,sessionEnded,onIntent,onReconnect,balance,onPause,pausePending=false,asyncDraftUserId,navigation,onMovePresentationComplete}:Props){
 const inspection=useMemo(()=>readOnly?{...authoritative,canAct:false,movePresentation:undefined}:authoritative,[readOnly,authoritative]);
 const {visual:v,frame:scoreMotion}=useWordScorePresentation(inspection,now,!!asyncDraftUserId,readOnly?undefined:onMovePresentationComplete);
 const [selected,setSelected]=useState<number|null>(null),[draft,setDraft]=useState<Placement[]>([]),[dialog,setDialog]=useState<'blank'|'pass'|'exchange'|null>(null),[blank,setBlank]=useState<{tile:TileOrigin;square:number}|null>(null),[exchanges,setExchanges]=useState<number[]>([]);
 const [rackOrder,setRackOrder]=useState<number[]>([]),[invalid,setInvalid]=useState(false);
 const dialogReturnFocus=useRef<HTMLElement|null>(null),dialogSurface=useRef<HTMLDivElement>(null);
 const openDialog=(next:'blank'|'pass'|'exchange',returnFocus?:HTMLElement|null)=>{
  dialogReturnFocus.current=returnFocus??document.activeElement as HTMLElement;
  setDialog(next);
 };
 const rack=[...v.rack].sort((a,b)=>{const rank=(id:number)=>{const i=rackOrder.indexOf(id);return i<0?rackOrder.length+v.rack.findIndex(t=>t.id===id):i;};return rank(a.id)-rank(b.id);});
 useEffect(()=>{if(!isInvalidWord(error)){setInvalid(false);return;}setInvalid(true);const timer=setTimeout(()=>setInvalid(false),1500);return()=>clearTimeout(timer);},[error,errorVersion]);
 const hostElement=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
 const presentation=wordPresentation(v,now);
 const shownBoard=visibleBoard(v,now); const highlighted=new Set(presentation?wordSquares(v):[]);
 let lastOwnWord=0;for(let i=v.moves.length-1;i>=0;i--){const move=v.moves[i];if(move.playerId===v.viewerId&&move.action==='place'){lastOwnWord=move.turn;break;}}
 const scope=`${v.identity.dealerGameId}:${v.identity.roundId}:${v.turn}`;
 const placementSound=useRef<{scope:string;square:number;tileId:number;id:string}|null>(null);
 const stageTile=(placement:Placement)=>{
  placementSound.current={scope,square:placement.square,tileId:placement.tileId,id:crypto.randomUUID()};
  setDraft(current=>current.some(p=>p.tileId===placement.tileId)
   ?current.map(p=>p.tileId===placement.tileId?placement:p)
   :[...current,placement]);
  setSelected(null);
 };
 useLayoutEffect(()=>{
  const event=placementSound.current;placementSound.current=null;
  if(!event||event.scope!==scope||activeTab!=='cards'||v.paused||sessionEnded||!gameplay)return;
  const cell=viewport.current?.querySelector(`[data-square="${event.square}"].is-staged`);
  if(draft.some(p=>p.square===event.square&&p.tileId===event.tileId))
   presentSound('peg',`words:placement:${scope}:${event.id}`,cell??null);
 },[draft,scope,activeTab,v.paused,sessionEnded,gameplay]);
 const draftKey=asyncDraftUserId?draftPrefix+asyncDraftUserId+':'+v.identity.dealerGameId:null;
 const draftScope=draftKey?draftIdentity(v):scope,skipSave=useRef(false);
 const draftSnapshot=useRef(v);
 draftSnapshot.current=v;
 useEffect(()=>{if(!draftKey)return;skipSave.current=true;try{setDraft(restoreDraft(localStorage.getItem(draftKey),draftSnapshot.current));}catch{setDraft([]);}},[draftKey,draftScope]);
 useEffect(()=>{if(!draftKey)return;if(skipSave.current){skipSave.current=false;return;}try{if(v.phase==='complete'||!v.canAct||!draft.length)localStorage.removeItem(draftKey);else localStorage.setItem(draftKey,JSON.stringify({identity:draftScope,placements:draft}));}catch{/* Drafts remain editable if storage is unavailable. */}},[draftKey,draftScope,draft,v.phase,v.canAct]);
 useEffect(()=>{if(!draftKey)setDraft([]);setSelected(null);setDialog(null);setBlank(null);setExchanges([]);setInvalid(false);},[draftKey,scope]);
 const waitingForClock=!!asyncDraftUserId&&v.playDeadline===null&&!readOnly&&v.canAct&&!v.finished;
 const announce=waitingForClock&&!presentation&&!scoreMotion&&!v.paused&&!pending&&!error&&connected&&activeTab==='cards';
 const turnKey=v.identity.dealerGameId+':'+v.turn;
 const handoff=usePlayback(announce?2000:0,announce?turnKey:'');
 const sentStart=useRef('');
 useEffect(()=>{
  if(announce&&handoff.done&&sentStart.current!==turnKey){
   sentStart.current=turnKey;
   void onIntent({type:'begin_turn'}).then(ok=>{if(!ok)sentStart.current='';});
  }
 },[announce,handoff.done,turnKey,onIntent]);
 const editable=gameplay&&activeTab==='cards'&&!waitingForClock&&!readOnly&&v.canAct&&!presentation&&!scoreMotion&&!v.paused&&!pending&&(connected||!!asyncDraftUserId)&&now<v.deadline&&v.phase==='playing'&&!v.finished&&!sessionEnded;
 useEffect(()=>{if(readOnly){setDraft([]);setSelected(null);setDialog(null);setBlank(null);setExchanges([]);}},[readOnly]);
 useEffect(()=>{if(v.paused){setDialog(null);setSelected(null);setBlank(null);}},[v.paused]);
 const host=v.hostUserId===v.players.find(p=>p.id===v.viewerId)?.userId;
 const cancelRequest=!host&&!v.paused&&v.pauseRequest?.playerId===v.viewerId;
 const banks=Array.from({length:v.rules.timeBankUses??0},(_,slot)=>slot).filter(slot=>!v.timeBankSpent?.[v.viewerId]?.includes(slot));
 const used=new Set(draft.map(p=>p.tileId)),actor=v.players.find(p=>p.id===v.activePlayerId),left=Math.max(0,Math.ceil((v.deadline-(presentation?presentation.readyAt:v.paused?v.pausedAt??now:now))/1000));
 const send=async(intent:Intent)=>{if(readOnly)return;setDialog(null);if(await onIntent(intent)){setDraft([]);setSelected(null);}};
 const draftAt=(square:number)=>draft.find(p=>p.square===square);
 const canDrop=(origin:TileOrigin,target:DropTarget)=>{
  if(!editable||!rack.some(tile=>tile.id===origin.tileId))return false;
  const staged=draft.find(p=>p.tileId===origin.tileId);
  if(staged?.square!==origin.square)return false;
  if(target.kind==='rack')return !!staged;
  return target.square!==origin.square&&!v.board[target.square]&&!draftAt(target.square);
 };
 const moveTile=(origin:TileOrigin,target:DropTarget,blankLetter?:string)=>{
  if(!canDrop(origin,target))return;
  if(target.kind==='rack'){
   setDraft(current=>current.filter(p=>p.tileId!==origin.tileId));
   setSelected(null);
   return;
  }
  const rackTile=rack.find(tile=>tile.id===origin.tileId)!;
  const staged=origin.square===undefined?undefined:draftAt(origin.square);
  const letter=staged?.letter??blankLetter??rackTile.face;
  if(letter==='?'){
   setBlank({tile:origin,square:target.square});
   openDialog('blank',viewport.current?.querySelector<HTMLButtonElement>(`[data-square="${target.square}"]`));
   return;
  }
  stageTile({tileId:origin.tileId,square:target.square,letter});
 };
 const tapSquare=(square:number)=>{
  if(!editable)return;
  const staged=draftAt(square);
  if(staged){
   moveTile(staged,{kind:'rack'});
   setSelected(staged.tileId);
  }else if(selected!==null){
   moveTile({tileId:selected},{kind:'square',square});
  }
 };
 const tapRack=(tileId:number)=>{
  if(editable&&!used.has(tileId))setSelected(current=>current===tileId?null:tileId);
 };
 const gestures=useWordsBoardGestures({
  host:hostElement,board:viewport,
  enabled:activeTab==='cards'&&!v.paused&&!presentation&&!sessionEnded&&dialog===null,
  scope:`${authoritative.identity.dealerGameId}:${authoritative.identity.roundId}:${authoritative.turn}:${editable}:${sessionEnded}`,
  tileAt:surface=>{
   if(!editable)return;
   const staged=surface.kind==='board'&&surface.square!==undefined?draftAt(surface.square):undefined;
   const tileId=surface.kind==='rack'?surface.tileId:staged?.tileId;
   const tile=rack.find(tile=>tile.id===tileId);
   return tile?{tileId:tile.id,square:staged?.square,letter:staged?.letter??tile.face,value:tile.value}:undefined;
  },
  canDrop,drop:moveTile,tapSquare,tapRack,
 });
 const resetCamera=gestures.reset;
 useLayoutEffect(()=>{resetCamera();},[authoritative.identity.dealerGameId,authoritative.identity.roundId,lastOwnWord,resetCamera]);
 const camera=presentation?.opponent?focusWord([...highlighted,...presentation.squares],gestures.size):gestures.camera;
 const countdownActive=gameplay&&!readOnly&&!sessionEnded&&activeTab==='cards'&&!authoritative.paused
  &&!authoritative.finished&&authoritative.phase==='playing'&&!presentation&&!scoreMotion
  &&(!asyncDraftUserId||authoritative.playDeadline!=null);
 const bankCount=authoritative.timeBankSpent?.[authoritative.activePlayerId]?.length??0;
 const countdownKey=countdownActive
  ?`${authoritative.identity.dealerGameId}:${authoritative.identity.roundId}:${authoritative.turn}:${authoritative.activePlayerId}:${bankCount}`:null;
 const seconds=useWordsCountdown(countdownKey,asyncDraftUserId?authoritative.playDeadline??0:authoritative.deadline,now,dialog?dialogSurface:viewport,connected);
 const countdownInRail=gestures.size.width-fittedBoardSize(gestures.size)*camera.scale<140;
 const ghost=gestures.ghost;
 const draggedTile=(tile:TileOrigin)=>ghost?.tile.tileId===tile.tileId&&ghost.tile.square===tile.square;
 const hoverSquare=ghost?.target?.kind==='square'?ghost.target.square:undefined;
 const text=error.replace(/^.*ptown_words:/,'').replace('invalid_word:', 'Not in ENABLE2K: ').replace(/_/g,' ');
 const scores=<div className="words-scores">{v.players.map(p=><div key={p.id} data-score-player={p.id} data-active={p.id===(!gameplay&&reviewPlayerId?reviewPlayerId:scoreMotion?.playerId??presentation?.playerId??(waitingForClock?v.movePresentation?.playerId:undefined)??(v.phase==='playing'?v.activePlayerId:null))}><span>{p.id===v.viewerId?'You':p.name}</span><strong>{scoreMotion?.playerId===p.id?scoreMotion.score:v.scores[p.id]??0}</strong>{scoreMotion?.playerId===p.id&&scoreMotion.phase!=='reveal'&&<span className="words-score-plus" aria-hidden="true" data-phase={scoreMotion.phase} style={{'--score-progress':scoreMotion.progress} as CSSProperties}>+{scoreMotion.points}</span>}<span className="words-last" aria-label="Last scored word">{scoreMotion?.playerId===p.id&&scoreMotion.phase!=='after'?'':lastScoredWord(v,p.id)}</span>{balance?.(p.id)}</div>)}</div>;
 const actions=sessionEnded?<span>Session ended</span>:v.phase==='complete'&&!presentation?<div className="words-result"><strong>{v.terminal?.winnerIds.map(id=>v.players.find(p=>p.id===id)?.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong>{!asyncDraftUserId&&<span>Final rack deductions applied</span>}</div>:<div className="words-player" data-canonical-felt-interaction-layer="">
  <div className="words-status"><strong className={editable?'words-your-turn':undefined}>{v.paused?'Paused':presentation?`${v.players.find(p=>p.id===presentation.playerId)?.name??'Player'} played`:v.canAct?'Your turn':`${actor?.name??'Opponent'}’s turn`}</strong>{v.canAct&&<button className="words-rumble" aria-label="Shuffle rack" title="Shuffle rack" disabled={!editable} onClick={()=>setRackOrder(shuffleRack(rack.map(t=>t.id)))}><RefreshCw size={16} aria-hidden="true"/></button>}<div className="words-clock"><time>{asyncDraftUserId&&v.playDeadline==null?Math.floor(left/3600)+'h '+Math.floor(left%3600/60)+'m':Math.floor(left/60)+':'+String(left%60).padStart(2,'0')}</time>{!readOnly&&v.canAct&&banks.map(slot=><button key={slot} className="words-bank" aria-label={'Use time bank '+(slot+1)+': add 3 minutes'} disabled={!editable} onClick={()=>void onIntent({type:'time_bank',items:[{slot}]})}>+3m</button>)}</div>{!asyncDraftUserId&&!!v.rules.timeBankUses&&<button className="words-pause" data-cancel-request={cancelRequest||undefined} aria-label={cancelRequest?'Cancel pause request':v.paused?'Resume game':host?'Pause game':'Request pause'} title={cancelRequest?'Cancel pause request':v.paused?'Resume':host?'Pause':'Request pause'} disabled={readOnly||pending||pausePending||!connected||(v.paused&&!host)||(!host&&!!v.pauseRequest&&!cancelRequest)||v.phase!=='playing'} onClick={()=>host?onPause?.():void onIntent(cancelRequest?{type:'cancel_pause_request',items:[{requestId:v.pauseRequest!.id}]}:{type:'request_pause'})}>{cancelRequest?<X size={18}/>:v.paused?<Play size={18}/>:<Pause size={18}/>}</button>}<span>{v.bagCount} in bag</span></div>
  <div className="words-rack" data-view-only={readOnly||undefined} data-concealed={v.paused} data-actionable={editable} data-drop-target={ghost?.target?.kind==='rack'||undefined} aria-label="Your private rack">
   {rack.map(tile=><button key={tile.id} data-tile-id={tile.id} aria-label={v.paused?'Concealed tile':`${tile.face==='?'?'Blank':tile.face}, ${tile.value} points`}
    aria-pressed={selected===tile.id} data-used={used.has(tile.id)} data-dragging={draggedTile({tileId:tile.id})||undefined}
    disabled={!editable||used.has(tile.id)} onClick={event=>{if(event.detail===0)tapRack(tile.id);}}>
    {v.paused?'◇':tile.face==='?'?'◇':tile.face}{!v.paused&&<small>{tile.value}</small>}
   </button>)}
  </div>
  {!readOnly&&<div className="words-submit-slot"><button className="words-submit" hidden={!draft.length} disabled={!draft.length||!editable||!connected} onClick={()=>void send({type:'place',items:draft})}>{pending?'Submitting…':'Submit Word'}</button></div>}
  <div className="words-turn-actions">{draft.length>0?<><button disabled={!editable} onClick={()=>setDraft(d=>d.slice(0,-1))}>Undo</button><button disabled={!editable} onClick={()=>{setDraft([]);setSelected(null);}}>Recall</button></>:<><button disabled={!editable||v.bagCount<7} title={v.bagCount<7?'Need 7 in bag':undefined} onClick={()=>{setExchanges([]);openDialog('exchange');}}>Exchange</button><button disabled={!editable} onClick={()=>openDialog('pass')}>Pass</button></>}</div>
  {((error&&!isInvalidWord(error))||!connected)&&<div className="words-error" role="status">{text||'Reconnecting…'}{!connected&&<button onClick={onReconnect}>Reconnect</button>}</div>}
 </div>;
 return <div className="words-host" ref={hostElement} {...gestures.pointerHandlers}><FullscreenGameShell gameplay={gameplay} navigation={navigation} announcement={announce?<div className="words-turn-announcement" role="status">YOUR TURN</div>:undefined} className="words-shell" title="Ptown Words" description="" activeTab={activeTab} setActiveTab={setActiveTab} sessionLabel={<PtownWordsRulesLabel/>} panelTitle={activeTab==='lobby'?'Rules':undefined} panel={panel} scores={scores} actions={actions} sessionEnded={sessionEnded}>
  {!sessionEnded&&<div className="words-board-region" data-paused={v.paused}>
   {readOnly&&<div className="words-view-only" role="status">Opponent's Turn — View Only</div>}
   {v.paused&&<div className="words-paused-cover" role="status">Paused{!host&&<small>Waiting for host to resume</small>}</div>}
   {invalid&&<div className="words-invalid" role="alert">invalid word</div>}
   <div className="words-navigation" data-canonical-felt-interaction-layer="">
    <span>{selected!==null?'Tap a square to place your tile':editable?'Drag tiles · Pinch to zoom':'Pinch to zoom'}</span>
    <button type="button" className="words-reset-zoom" data-words-reset="" data-hidden={gestures.camera.scale===1||undefined} disabled={gestures.camera.scale===1||!!presentation||v.paused}
     onClick={event=>{if(event.detail===0)gestures.resetZoom();}}>Reset Zoom</button>
   </div>
   <div className="words-viewport" data-zoom={camera.scale} ref={viewport} tabIndex={0} aria-label="Board navigation"
    title="Pinch or use + and − to zoom. Drag empty space or use the arrow keys to pan."
    aria-busy={!!presentation} onDoubleClick={event=>event.preventDefault()} onKeyDown={gestures.onKeyDown}>
    <div className="words-grid" role="grid" aria-label="Ptown Words board" data-canonical-felt-interaction-layer=""
     style={{transform:`translate3d(${camera.x}px,${camera.y}px,0) scale(${camera.scale})`}}>
     {v.board.map((_,square)=>{
      const stage=v.paused||readOnly?undefined:draftAt(square);
      const visible=shownBoard[square],tile=stage?{...v.rack.find(t=>t.id===stage.tileId)!,letter:stage.letter}:visible;
      const premium=premiumAt(square),flipIndex=presentation?.opponent?[...presentation.squares].sort((a,b)=>a-b).indexOf(square):-1;
      const flipping=!!tile&&flipIndex>=0&&presentation!.at<presentation!.startedAt+presentation!.focusMs+(flipIndex+1)*presentation!.flipMs;
      return <button role="gridcell" key={square} data-square={square} data-word-highlight={highlighted.has(square)||undefined}
       data-drop-target={hoverSquare===square||undefined} data-dragging={!!stage&&draggedTile(stage)||undefined}
       className={`words-cell ${tile?'has-tile':''} ${stage?'is-staged':''} ${flipping?'is-revealing':''}`}
       style={flipping?{animationDuration:`${presentation!.flipMs}ms`,animationPlayState:v.paused?'paused':'running'}:undefined}
       aria-label={`${String.fromCharCode(65+square%15)}${Math.floor(square/15)+1}${tile?` ${tile.letter}, ${tile.value} points`:premium?` ${premium}`:''}`}
       onClick={event=>{if(event.detail===0)tapSquare(square);}}>
       {tile?<><b>{tile.letter}</b><small>{tile.value}</small></>:<span className={`words-premium ${premium}`} data-center={square===112}>{square===112?'PT':premium}</span>}
      </button>;
     })}
    </div>
   </div>
   {seconds!==null&&<div className="words-countdown" aria-hidden="true" data-rail={countdownInRail||undefined}
    data-tone={seconds<=3?'urgent':seconds<=5?'warning':'neutral'}>
    <span key={seconds}>{seconds}</span>
   </div>}
  </div>}
 </FullscreenGameShell>
 <Dialog open={dialog!==null&&!v.paused&&!readOnly} onOpenChange={open=>{if(!open){setDialog(null);setBlank(null);}}}><DialogContent ref={dialogSurface} className="words-dialog" onCloseAutoFocus={e=>{e.preventDefault();dialogReturnFocus.current?.focus();}}><DialogTitle>{dialog==='blank'?'Choose blank letter':dialog==='pass'?'Pass this turn?':'Exchange tiles'}</DialogTitle><DialogDescription>{dialog==='pass'?'Your staged tiles return to your rack.':dialog==='exchange'?'Choose the tiles to exchange.':'The blank always scores zero.'}</DialogDescription>
 {dialog==='blank'?<div className="words-alphabet">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter=><button key={letter} onClick={()=>{if(blank)moveTile(blank.tile,{kind:'square',square:blank.square},letter);setBlank(null);setDialog(null);}}>{letter}</button>)}</div>:dialog==='exchange'?<><div className="words-exchange">{v.rack.map(tile=><button key={tile.id} aria-label={`${tile.face==='?'?'Blank':tile.face}, ${tile.value} points`} aria-pressed={exchanges.includes(tile.id)} onClick={()=>setExchanges(e=>e.includes(tile.id)?e.filter(id=>id!==tile.id):[...e,tile.id])}>{tile.face==='?'?'◇':tile.face}</button>)}</div><button disabled={!editable||!connected||!exchanges.length} onClick={()=>void send({type:'exchange',items:exchanges.map(tileId=>({tileId}))})}>Exchange {exchanges.length} tiles</button></>:<button disabled={!editable} onClick={()=>void send({type:'pass'})}>Pass turn</button>}
 <button onClick={()=>{setDialog(null);setBlank(null);}}>Cancel</button></DialogContent></Dialog>
 {ghost&&createPortal(<WordsTileGhost tile={ghost.tile} x={ghost.point.x} y={ghost.point.y} touch={ghost.touch}
  returnTo={ghost.returning?ghost.origin:undefined} square={hoverSquare} onReturn={gestures.clearGhost}/>,document.body)}
 </div>;
}

function WordsTileGhost({tile,x,y,touch,returnTo,square,onReturn}:{
 tile:DragTile;x:number;y:number;touch:boolean;returnTo?:{x:number;y:number};square?:number;onReturn:()=>void
}){
 const top=touch?y-34:y;
 const label=square===undefined?null:`${String.fromCharCode(65+square%15)}${Math.floor(square/15)+1}`;
 const bonus=square===undefined?'':square===112?'PT':premiumAt(square);
 return <div className="words-tile-ghost" aria-hidden="true" data-returning={!!returnTo||undefined} onAnimationEnd={onReturn}
  style={{
   left:`clamp(26px, ${x}px, calc(100% - 26px))`,
   top:`clamp(${touch&&label?50:26}px, ${top}px, calc(100% - 26px))`,
   '--words-return-x':returnTo?`${returnTo.x}px`:undefined,
   '--words-return-y':returnTo?`${returnTo.y}px`:undefined,
  } as CSSProperties}>
  {touch&&label&&<span className="words-target-preview">{label}{bonus&&` · ${bonus}`}</span>}
  <b>{tile.letter==='?'?'◇':tile.letter}</b><small>{tile.value}</small>
 </div>;
}
