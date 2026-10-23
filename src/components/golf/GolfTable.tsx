import {useGolfCardPresentation} from './useGolfCardPresentation';
import {useGolfScoringPresentation} from './useGolfScoringPresentation';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {TableauCard} from '@/lib/canonicalShell/TableauCard';
import {CanonicalCardCountBadge} from '@/components/canonicalShell/CanonicalCardCountBadge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useGolf} from '@/hooks/useGolf';
import {golfTransport,golfRpc} from '@/lib/golf/client';
import {golfCard,golfWarning,type GolfSnapshot} from '@/lib/golf/model';
import {useGolfFinancial} from './useGolfFinancial';
import GolfRules from '@/components/rules/GolfRules';
import {usePublishShellFelt} from '@/lib/canonicalShell/ShellOwnedFeltHost';
import {useCanonicalFeltInteractionLayerElement} from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import {ShellTimerRail,useShellTimer} from '@/lib/canonicalShell/ShellTimerRail';
import {useShellTabBar,type ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {GameplayOpponentSeatLayer} from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {CanonicalPlayerIdentityRow} from '@/lib/canonicalShell/CanonicalPlayerIdentityRow';
import {golfScoreFrame,signedGolf} from './golfScoring';
import {GolfHoleFlag} from './GolfHoleFlag';
import {GolfLeaderboard,GolfScorecard,golfPresentedScores} from './GolfScorecard';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
import './golf.css';
interface Props {dealerGameId:string;retentionRoundId?:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(token:string)=>void}
export function GolfTable(props:Props) {
 const transport=useMemo(()=>golfTransport(props.dealerGameId),[props.dealerGameId]),game=useGolf(props.dealerGameId,props.userId,transport);
 const presentation=useGolfCardPresentation(game.snapshot,game.epoch,props.userId);
 const scoringPresentation=useGolfScoringPresentation(game.snapshot,game.epoch,game.now,presentation.busy);
 const v=scoringPresentation.snapshot,winnerReady=scoringPresentation.winnerReady;
 const ready=useGolfFinancial(game.snapshot,props.sessionEnded,winnerReady,props.dealerGameId),layer=useCanonicalFeltInteractionLayerElement(!props.sessionEnded);
 const [selected,setSelected]=useState<number[]>([]),[discard,setDiscard]=useState(false),[selectedStock,setSelectedStock]=useState(false),[error,setError]=useState('');
 const [rulesOpen,setRulesOpen]=useState(false),[inspectPlayer,setInspectPlayer]=useState<string|null>(null);
 const [infoOpen,setInfoOpen]=useState(false),[scorecardOpen,setScorecardOpen]=useState(false);
 const [reclaiming,setReclaiming]=useState(false);
 const announced=useRef(''),closing=useRef(false),completed=useRef(false),sawLive=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const chat=useGameChatContext(),announcements=useAnnouncements();
 const scoring=!!v&&!presentation.busy&&!scoringPresentation.waiting&&(v.phase==="hole_complete"||v.phase==="complete");
 const scoreFrame=v&&scoring?golfScoreFrame(v,scoringPresentation.now,scoringPresentation.seek):null;
 const scoreBeat=scoreFrame?.beat;
 const scoresReleased=!!v&&!presentation.busy&&!scoringPresentation.waiting&&(v.presentation?scoringPresentation.now>=v.presentation.resultsAt:!!scoreFrame?.results||winnerReady);
 const scoreView=v?golfPresentedScores(v,scoresReleased):null;
 const flipAdmission=useRef({key:'',elapsed:0});
 const flipKey=v?.scope+':'+scoreFrame?.index;
 if(flipAdmission.current.key!==flipKey)flipAdmission.current={key:flipKey,elapsed:scoreFrame&&'beatElapsedMs' in scoreFrame?scoreFrame.beatElapsedMs??0:0};
 const self=v?.players.find(p=>p.id===v.viewerId),actor=v?.players[v.turnIndex];
 const reclaim=async()=>{if(!v||!self||reclaiming)return;setReclaiming(true);try{await golfRpc('golf_reclaim_control',{p_dealer_game_id:v.id,p_round_id:v.scope,p_expected_version:v.playerControls?.[self.id]?.intentVersion});setError('');}catch(e){setError((e as Error).message);}finally{setReclaiming(false);game.reconnect();}};
 const acting=!!v?.canAct&&v.scope===game.snapshot?.scope&&!game.pending&&game.connected&&!v.paused&&game.now<v.deadline&&!props.sessionEnded&&!presentation.busy&&!scoringPresentation.waiting;
 if(v&&!v.settled)sawLive.current=true;
 useEffect(()=>{setSelected([]);setDiscard(false);setSelectedStock(false);},[v?.scope,v?.turnIndex,v?.revision]);
 usePublishShellFelt({gameKind:'six-card-golf',anteAmount:v?.stake??0,publisherLabel:'GolfTable'});
 useShellTabBar({cardsIcon:"spade",activeTab:props.activeTab,setActiveTab:props.setActiveTab,cardsFlashing:acting?'green':null,isPaused:!!v?.paused});
 useShellTimer(v&&!v.settled&&v.phase!=='hole_complete'?{secondsRemaining:Math.max(0,Math.ceil((v.deadline-(v.paused?v.pausedAt??game.now:game.now))/1000)),totalSeconds:30,paused:v.paused,actorLabel:actor?.name,activePlayerId:actor?.id,identityKey:v.scope+':'+v.turnIndex+':'+v.deadline}:null);
 useEffect(()=>{
  if(!v)return;
  if(v.settled&&!props.sessionEnded)callbacks.current.onTerminalActive(true);
  const key=v.scope+':'+v.phase+':'+v.finalReason+':'+winnerReady;
  if(announced.current===key)return;
  const first=!announced.current;announced.current=key;
  if(v.phase==='hole_complete'||v.phase==='complete')announcements.dismiss('golf-final:'+v.scope);
  if(!first&&v.finalReason&&v.phase==='playing')announcements.emit({id:'golf-final:'+v.scope,type:'gameplay_notice',scope:{dealerGameId:v.identity.sessionId,roundId:v.scope},payload:{title:v.finalReason==='prolonged_play'?'Ptown house rule: one final turn each':'Final turns'},ttlMs:2500});
  if(v.settled&&v.terminal&&winnerReady&&!props.sessionEnded) {
   callbacks.current.onTerminalActive(true);
   const names=v.players.filter(p=>v.terminal!.winnerIds.includes(p.id)).map(p=>p.name).join(' & ');
   announcements.emit({id:'golf-win:'+v.terminal.resultId,type:'match_win',scope:{dealerGameId:v.identity.sessionId,roundId:v.scope},payload:{text:names+' win with '+v.terminal.score},ttlMs:Math.max(1,v.terminal.deadline-v.terminal.startedAt)});
   celebrateCanonicalWinner(v.terminal.resultId,v.viewerId,v.terminal.winnerIds,sawLive.current&&game.epoch===0);
  }
 },[v,props.sessionEnded,announcements,winnerReady,game.epoch]);
 useEffect(()=>{
  if(v?.paused||!v?.settled||!ready||!winnerReady||!scoringPresentation.terminalDone||props.sessionEnded||completed.current)return;
  if(v.finished) {
   completed.current=true;
   callbacks.current.onTerminalComplete('six-card-golf|winseq|'+v.identity.sessionId+'|'+v.id+'|1|'+v.financial.resultId+'|'+(callbacks.current.retentionRoundId??v.holes[0]?.roundId??v.scope));
   callbacks.current.onTerminalActive(false);return;
  }
  if(closing.current)return;closing.current=true;
  void golfRpc('golf_close',{p_dealer_game_id:v.id}).then(()=>game.reconnect()).catch(e=>{setError((e as Error).message);});
 },[v,ready,props.sessionEnded,winnerReady,scoringPresentation.terminalDone]);
 // Retire the final-turn plate before the first scoring paint, not one frame later.
 useLayoutEffect(()=>{if(scoring&&v)announcements.dismiss('golf-final:'+v.scope);},[scoring,v?.scope,announcements.dismiss]);
 const announcementRef=useRef(announcements);announcementRef.current=announcements;
 const ambientTitle=v?.paused||props.sessionEnded?null:scoring?(scoreBeat?.text??null):actor?.id!==self?.id?actor?.name+' is playing':null;
 const ambientKey=v&&ambientTitle?[v.scope,scoring?'score:'+scoreFrame?.index:'turn:'+actor?.id+':'+v.deadline].join(':'):null;
 useEffect(()=>{
  if(!v||!ambientKey||!ambientTitle)return;
  const id='golf-ambient:'+ambientKey;
  announcementRef.current.emit({id,type:'gameplay_notice',behavior:'ambient',scope:{dealerGameId:v.identity.sessionId,roundId:v.scope},payload:{title:ambientTitle}});
  return()=>announcementRef.current.dismiss(id);
 },[ambientKey,ambientTitle]);
 const choose=(i:number)=>{
  if(!v||!acting)return;
  if(v.phase==='opening'){
   const next=selected.includes(i)?selected.filter(x=>x!==i):[...selected,i];
   setSelected(next);
   if(next.length===2)void game.act({type:'open',items:next});
   return;
  }
  if(v.pending)void game.act({type:'replace',items:[i]});
  else if(discard)void game.act({type:'discard',items:[i]});
 };
 const status=!v?'Connecting to table…':v.settled?'Match complete':v.paused?(self&&v.playerControls?.[self.id]?.autoPlay?'Paused · uncheck Auto-play to rejoin, then the host can resume':'Paused · waiting for the host to resume'):!game.connected?'Connecting to live table…':game.pending?'Sending your move…':self&&v.playerControls?.[self.id]?.autoPlay?'Auto-play is on · uncheck to take control':v.phase==='hole_complete'?'Hole '+v.hole+' complete':v.phase==='opening'?(acting?(selected.length?'1 of 2 selected · tap a second card to reveal both':'Tap any two of your cards to reveal them'):actor?.name+' is choosing two cards'):acting?(v.pending?'Replace a card or discard your draw':discard?'Choose a card to replace':'Choose stock or discard'):actor?.name+"'s turn";
 const tableauFace=(player:string,i:number)=>{const m=presentation.move,displaced=m?.actor===player&&m.index===i&&(m.stage==='incoming'||m.stage==='landed'||m.stage==='outgoing'),old=displaced?m.before.tableaus[player].cards[i]:null;
  const card=scoringPresentation.waiting&&v?.presentation?.hidden[player]?.includes(i)?null:presentation.card(player,i);
  const tier=player===v?.viewerId?'medium':'small';
  return <>{displaced&&<span data-card-anchor={'tableau-'+player+'-7'} data-golf-displaced={m.stage} className="golf-displaced" style={{opacity:m.stage==='outgoing'?0:1}}><TableauCard tier={tier} card={golfCard(old)} isHidden={old===null} style={{width:'100%',height:'100%'}}/></span>}
   {(!displaced||m.stage!=='incoming')&&<TableauCard tier={tier} card={golfCard(card)} isHidden={card===null} style={{width:'100%',height:'100%'}}/>}</>;
 };
 const localTableau=self&&v&&!props.sessionEnded&&!scoring?<div className="golf-local" aria-label="Your six-card tableau"><div className="golf-tableau">{v.tableaus[self.id].cards.map((card,i)=><button key={i} data-card-anchor={'tableau-'+self.id+'-'+i} data-golf-position={i} disabled={!acting||v.phase==='playing'&&!v.pending&&!discard} aria-pressed={selected.includes(i)} aria-label={'Row '+(i<3?1:2)+', column '+(i%3+1)+(card===null?', face down':', '+golfCard(card)?.rank)} onClick={()=>choose(i)}><span className="golf-card-artifact">{tableauFace(self.id,i)}{selected.includes(i)&&<span aria-hidden className="golf-selection"/>}</span></button>)}</div></div>:null;
 const warning=v&&!scoring?golfWarning(v):null;
 const shownActor=presentation.move?.actor??actor?.id;
 const opponents=v?.players.filter(p=>p.id!==self?.id&&p.id===shownActor)??[];
 const helper=props.sessionEnded?'Session ended':v?.paused?'Paused - Info for rejoin controls':scoring?(scoreBeat&&scoreBeat.kind!=='exit'?'Scoring '+v?.players.find(p=>p.id===scoreBeat.playerId)?.name+'/Hole '+v?.hole+': '+signedGolf(scoreBeat.subtotal):'Hole '+v?.hole+' results'):warning??(acting&&v?.phase==='opening'?'Select 2 cards to flip up':acting&&v?.pending?'Choose a spot to put it!':status);
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{scoreView?.holes.map(h=><p key={h.hole}>Hole {h.hole}: {v.players.map(p=>p.name+' '+h.scores[p.id]).join(' · ')}</p>)}</div>:<GolfRules version={v?.rules.version}/>;
 return <>
  <Dialog open={scorecardOpen&&!props.sessionEnded} onOpenChange={setScorecardOpen}><DialogContent className="golf-scorecard-dialog"><DialogHeader><DialogTitle>Nine-hole scorecard</DialogTitle><DialogDescription>Only counted holes appear in the total.</DialogDescription></DialogHeader>{scoreView&&<GolfScorecard snapshot={scoreView}/>}</DialogContent></Dialog>
  <Dialog open={!!scoreFrame?.results&&!props.sessionEnded} onOpenChange={()=>{}}><DialogContent className="golf-scorecard-dialog" showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onPointerDownOutside={e=>e.preventDefault()}><DialogHeader><DialogTitle>Nine-hole scorecard</DialogTitle><DialogDescription>Hole {v?.hole} complete · cumulative totals.</DialogDescription></DialogHeader>{v&&<GolfScorecard snapshot={v} writeHole={scoringPresentation.seek?undefined:v.hole}/>}</DialogContent></Dialog>
  <Dialog open={infoOpen&&!props.sessionEnded} onOpenChange={setInfoOpen}><DialogContent><DialogHeader><DialogTitle>Table information</DialogTitle><DialogDescription>Scores are totals from completed holes.</DialogDescription></DialogHeader><div className="golf-controls">
   {v&&<div className="golf-summary" aria-label="Completed-hole totals"><strong>Hole {v.hole} / 9</strong>{v.players.map(p=>p.id===v.viewerId?<span key={p.id}>You: {scoreView!.scores[p.id]}</span>:<button key={p.id} onClick={()=>{setInfoOpen(false);setInspectPlayer(p.id);}}>View {p.name} · Total {scoreView!.scores[p.id]}</button>)}</div>}
   <p>{status}</p>{warning&&<p className="golf-warning">{warning}</p>}
   <button onClick={()=>{setInfoOpen(false);setRulesOpen(true);}}>Rules</button>
   {self&&v?.playerControls?.[self.id]?.autoPlay&&!v.settled&&<label className="golf-autoplay"><input type="checkbox" aria-label="Auto-play" checked disabled={reclaiming||!game.connected} onChange={e=>{if(!e.target.checked)void reclaim();}}/>Auto-play · uncheck to rejoin</label>}
   {(error||game.error)&&<button onClick={()=>{setError('');closing.current=false;game.reconnect();}}>{error||game.error} · Reconnect</button>}
  </div></DialogContent></Dialog>
  <Dialog open={!!inspectPlayer&&!props.sessionEnded} onOpenChange={open=>{if(!open)setInspectPlayer(null);}}><DialogContent><DialogHeader><DialogTitle>{v?.players.find(p=>p.id===inspectPlayer)?.name} · public tableau</DialogTitle><DialogDescription>Face-down cards remain concealed. Total from completed holes: {inspectPlayer?scoreView?.scores[inspectPlayer]:0}</DialogDescription></DialogHeader><div className="golf-inspect">{inspectPlayer&&v?.tableaus[inspectPlayer]?.cards.map((card,i)=><TableauCard key={i} card={golfCard(card)} isHidden={card===null} style={{width:72,height:101}}/>)}</div></DialogContent></Dialog>
  <Dialog open={rulesOpen&&!props.sessionEnded} onOpenChange={setRulesOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Six-Card Golf rules</DialogTitle><DialogDescription>{v?.rules.version} · frozen for this match</DialogDescription></DialogHeader><div className="catalog-scroll"><GolfRules version={v?.rules.version}/></div></DialogContent></Dialog>
  <div aria-hidden data-canonical-shell-play-top-spacer="" style={{flex:'0 0 var(--play-top-safe-area, 0px)',pointerEvents:'none'}}/>
  <div style={{position:'relative',height:'var(--shell-felt-h)',flex:'0 0 var(--shell-felt-h)',pointerEvents:'none'}}>
  {v&&!props.sessionEnded&&<GameplayOpponentSeatLayer family="six-card-golf" participants={v.players.filter(p=>p.id!==self?.id).map(p=>({...p,position:p.seat}))} presentation={{
   inwardSeatContent:true,
   cardBacks:p=>({count:6,visible:true,variant:'cribbage',exposed:v.tableaus[p.id].exposed}),
   onInspectTableau:p=>setInspectPlayer(p.id),
   dealerPip:p=>p.id===v.players[v.dealerIndex]?.id,
   scoreLine:p=>'Total '+scoreView!.scores[p.id],
   scoreAutoPlay:p=>!!v.playerControls?.[p.id]?.autoPlay,
   activeTimer:p=>p.id===actor?.id&&!v.paused&&!v.settled?{timeLeft:Math.max(0,Math.ceil((v.deadline-game.now)/1000)),maxTime:30,activePlayerId:p.id}:null,
  }}/>}
  </div>
  {layer&&v&&!props.sessionEnded&&createPortal(<div className="golf-felt" data-golf-phase={v.phase}>
   {!scoring&&v.finalQueue.length>0&&opponents.length===0&&<div className="golf-final-turn" role="status">FINAL TURN{v.finalReason==='prolonged_play'&&<small>Ptown house rule</small>}</div>}
   <div className="golf-center-play" data-viewer-turn={!scoring&&shownActor===self?.id||undefined} style={{'--golf-opponent-count':Math.max(1,opponents.length)} as CSSProperties}>
   {winnerReady?<div className="golf-final-scorecard"><GolfScorecard snapshot={v}/></div>:scoring?<div className="golf-scoring-hand" data-golf-score-player={scoreBeat?.playerId} data-golf-score-kind={scoreBeat?.kind} data-golf-score-step={scoreFrame?.index}>
    {scoreBeat&&scoreBeat.kind!=='exit'&&<div className="golf-public-cards">{v.tableaus[scoreBeat.playerId].cards.map((card,i)=><span key={i} data-card-anchor={'tableau-'+scoreBeat.playerId+'-'+i} className={scoreBeat.kind!=='reveal'&&scoreBeat.indices.includes(i)?'golf-score-highlight':scoreBeat.scored.includes(i)?'golf-scored':''}>{scoreBeat.kind==='reveal'&&!scoreFrame?.seeked&&scoreBeat.indices.includes(i)?<span className="golf-scoring-flip" key={v.scope+':'+scoreFrame?.index} style={{animationDuration:scoreBeat.duration+'ms',animationDelay:-flipAdmission.current.elapsed+'ms',animationPlayState:v.paused?'paused':'running'}}><span className="golf-flip-back"><TableauCard isHidden style={{width:'100%',height:'100%'}}/></span><span className="golf-flip-front"><TableauCard card={golfCard(card)} style={{width:'100%',height:'100%'}}/></span></span>:<TableauCard card={scoreBeat.hidden.includes(i)?undefined:golfCard(card)} isHidden={card===null||scoreBeat.hidden.includes(i)} style={{width:'100%',height:'100%'}}/>}</span>)}</div>}
   </div>:<>
   <div className="golf-opponents" data-opponent-count={opponents.length}>{opponents.map(p=><div key={p.id} className="golf-public-grid" data-golf-public-tableau={p.id}>
    {v.finalQueue.length>0&&<div className="golf-final-turn" role="status">FINAL TURN{v.finalReason==='prolonged_play'&&<small>Ptown house rule</small>}</div>}<div className="golf-public-cards">{v.tableaus[p.id].cards.map((_,i)=><span key={i} data-card-anchor={'tableau-'+p.id+'-'+i}>{tableauFace(p.id,i)}</span>)}</div>
   </div>)}</div>
   <div className="golf-piles">
    <button data-golf-discard data-golf-selected={discard||presentation.move&&!presentation.move.stock&&['select','incoming'].includes(presentation.move.stage)||undefined} disabled={!acting||v.phase!=='playing'||v.hasPending} onClick={()=>setDiscard(x=>!x)} aria-pressed={discard} aria-label="Take discard"><span className="golf-pile-artifact" data-card-anchor="discard">{presentation.move?.stage==='flip'?<span className="golf-discard-flip" key={presentation.move.key} onAnimationEnd={presentation.finishFlip}><span className="golf-flip-back"><TableauCard isHidden style={{width:'100%',height:'100%'}}/></span><span className="golf-flip-front"><TableauCard card={golfCard(presentation.move.after.discardTop)} style={{width:'100%',height:'100%'}}/></span></span>:<TableauCard card={golfCard(presentation.discard)} isHidden={v.phase==='opening'||presentation.discard===null} style={{width:'100%',height:'100%'}} highlight={discard?'gold':null}/>}</span></button>
    <div className="golf-stock-slot"><button data-golf-stock data-golf-selected={selectedStock||presentation.pendingBack||undefined} disabled={!acting||v.phase!=='playing'||v.hasPending} onClick={()=>{setSelectedStock(true);void game.act({type:'draw'});}} aria-label={'Draw stock, '+v.stockCount+' cards'}><span className="golf-pile-artifact" data-card-anchor="stock"><TableauCard isHidden style={{width:'100%',height:'100%'}}/><CanonicalCardCountBadge count={v.stockCount}/></span></button>
    {(presentation.pendingActor||presentation.pending)&&<div data-golf-pending data-golf-selected aria-label={presentation.pendingActor===v.viewerId?'Drawn stock card':'Opponent drawn card, concealed'}><span className="golf-pile-artifact" data-card-anchor={'tableau-'+(presentation.pendingActor??v.viewerId)+'-6'}><TableauCard card={presentation.pendingBack?undefined:golfCard(presentation.pending?.card??null)} isHidden={presentation.pendingBack} style={{width:'100%',height:'100%'}}/></span></div>}
    {v.phase==='playing'&&v.hasPending&&v.pending?.actor===v.viewerId&&acting&&<button className="golf-reject-pill" data-golf-reject onClick={()=>void game.act({type:'reject'})} aria-label="Discard drawn card">Discard</button>}
    </div>
   </div></>}</div>

  </div>,layer)}
  <div aria-hidden data-canonical-shell-play-bottom-spacer="" style={{flex:'0 0 var(--play-bottom-safe-area, 0px)',pointerEvents:'none'}}/>
  <ShellHudGrid timer={<ShellTimerRail/>} pane={props.activeTab==='cards'?(props.sessionEnded?<span/>:<div className="golf-pane"><div className="golf-helper" role="status"><strong>{helper}</strong></div><div className="golf-hand-row"><div className="golf-hole-label">{v&&<GolfHoleFlag hole={v.hole}/>}</div><div className="golf-hand-slot">{localTableau}</div>{v&&<GolfLeaderboard snapshot={scoreView!} onOpen={()=>setScorecardOpen(true)}/>}</div><button className="golf-info-toggle" onClick={()=>setInfoOpen(true)} aria-label="Table information">Info</button></div>):<div className="golf-panel">{panel}</div>} identity={self?<CanonicalPlayerIdentityRow playerId={self.id} name={self.name} chips={self.chips} active={actor?.id===self.id&&!scoring&&!v?.paused}/>:<span>Observer</span>}/>

 </>;
}
