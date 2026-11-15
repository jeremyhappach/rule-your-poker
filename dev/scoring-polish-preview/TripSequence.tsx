import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {CribbageCountingPhase} from '@/components/CribbageCountingPhase';
import {CribbageDealOrchestrator} from '@/components/CribbageDealOrchestrator';
import {CribbagePegBoard} from '@/components/CribbagePegBoard';
import {CribbagePlayingCard} from '@/components/CribbagePlayingCard';
import {CanonicalCardBack} from '@/components/canonicalShell/CanonicalCardBack';
import {CardTransportProvider} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import {CardTransportRuntime} from '@/lib/canonicalShell/cardTransport/CardTransportRuntime';
import {DealRuntime,useDealRuntime} from '@/lib/canonicalShell/cardTransport/DealRuntime';
import {CanonicalAnnouncementLayer} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementLayer';
import {useAnnouncements} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import {createCountingClock} from '@/lib/cribbage/countingClock';
import {cribbageScoringScope,publishCribbageScoringNotice} from '@/lib/cribbage/scoringPresentation';
import type {CribbageCard,CribbageState} from '@/lib/cribbageTypes';
import {LAB_USER} from '../sound-lab/labAudio';

const players=[{id:'p1',user_id:LAB_USER,position:0,profiles:{username:'You'}},{id:'p2',user_id:'u2',position:1,profiles:{username:'Opponent'}}];
const seats=players.map(player=>({playerId:player.id,position:player.position}));
const card=(rank:string,suit:CribbageCard['suit'],value:number):CribbageCard=>({rank,suit,value});
const nextHand=[card('2','clubs',2),card('4','hearts',4),card('5','diamonds',5),card('8','spades',8),card('J','hearts',10),card('K','clubs',10)];
const counted:CribbageState={phase:'counting',turnOrder:['p1','p2'],dealerPlayerId:'p2',cribOwnerPlayerId:'p2',
  crib:[card('7','clubs',7),card('7','diamonds',7),card('7','hearts',7),card('K','spades',10)],cutCard:card('Q','hearts',10),
  pegging:{playedCards:[...[
    card('2','clubs',2),card('4','diamonds',4),card('8','hearts',8),card('K','clubs',10),
  ].map(card=>({playerId:'p1',card})),...[
    card('3','diamonds',3),card('6','clubs',6),card('10','spades',10),card('K','hearts',10),
  ].map(card=>({playerId:'p2',card}))]},
  playerStates:{p1:{pegScore:10},p2:{pegScore:26}}} as unknown as CribbageState;
export const tripEvidence=(window as any).tripEvidence={successorAt:null,completedAt:null,dealAt:null,dealFinishedAt:null};

function DealtHands(){
  const deal=useDealRuntime()!;
  const self=deal.getSettledCardsForPlayer('p1'),opponent=deal.getSettledCardsForPlayer('p2');
  useEffect(()=>{if(deal.dealSettled&&tripEvidence.dealFinishedAt===null)tripEvidence.dealFinishedAt=performance.now();},[deal.dealSettled]);
  return <>
    <div style={{position:'absolute',top:'14%',left:'50%',transform:'translateX(-50%)'}}>
      <p style={{textAlign:'center',marginBottom:8}}>Opponent</p>
      <div data-card-anchor="opp-stack-1" data-next-opponent-cards={opponent.length} style={{position:'relative',width:44,height:66}}>
        {opponent.map((item,i)=><div key={item.cardId} style={{position:'absolute',left:i*3,top:-i*2,width:44,height:66}}><CanonicalCardBack widthPx={44}/></div>)}
      </div>
    </div>
    <div data-card-anchor="felt-deal-origin" style={{position:'absolute',top:'44%',left:'50%',width:44,height:66,transform:'translate(-50%,-50%)'}}><CanonicalCardBack widthPx={44}/></div>
    <div data-cribbage-active-pane-content data-next-self-cards={self.length} style={{position:'absolute',left:'5%',right:'5%',top:'70%',height:'22%'}}>
      <div style={{display:'flex',justifyContent:'center',gap:3}}>{self.map(item=>item.visibleFace&&<CribbagePlayingCard key={item.cardId} card={item.visibleFace as CribbageCard} widthPx={44}/>)}</div>
      <p style={{textAlign:'center',marginTop:8}}>You · {deal.dealSettled?'Choose two cards for the crib':'Dealing'}</p>
    </div>
  </>;
}

/** Isolated frames; real counting, announcement, sound and opening-deal owners. */
export function TripSequence({id}:{id:number}){
  const roundId='trip-old-'+id,handContextId='trip-next-'+id;
  const rail=useAnnouncements(),railRef=useRef(rail);railRef.current=rail;
  const stage=useRef<HTMLDivElement>(null),overlay=useRef<HTMLDivElement>(null);
  const clock=useMemo(()=>{const c=createCountingClock(()=>{});c.accept(c.request(),performance.now(),new Date().toISOString(),{
    gameId:'preview',dealerGameId:'preview',roundId,handNumber:1,pauseVersion:0,paused:false,state:counted});return c;},[roundId]);
  useSyncExternalStore(clock.subscribe,clock.getSnapshot);
  const time=useRef(clock.getSnapshot()!).current;
  const [done,setDone]=useState(false),[scores,setScores]=useState<Record<string,number>>({p1:10,p2:20});
  const advanced=useRef(false);
  useLayoutEffect(()=>{
    Object.assign(tripEvidence,{successorAt:null,completedAt:null,dealAt:null,dealFinishedAt:null});
    return()=>railRef.current.retireTransientScope(cribbageScoringScope('preview',roundId));
  },[roundId]);
  useEffect(()=>{
    if(scores.p2!==26||advanced.current)return;advanced.current=true;tripEvidence.successorAt=performance.now();
    clock.accept(clock.request(),performance.now(),new Date().toISOString(),{...time.frame,roundId:handContextId,handNumber:2,
      state:{...counted,phase:'discarding',playerStates:{...counted.playerStates,p1:{...counted.playerStates.p1,hand:nextHand}}}});
  },[scores.p2,clock,time,handContextId]);
  const announce=useCallback((text:string|null,label:string|null,key?:number,target?:number,category?:string,onRetired?:(reason:string)=>void)=>{
    if(!text){railRef.current.retireTransientScope(cribbageScoringScope('preview',roundId));return;}
    publishCribbageScoringNotice(railRef.current,{gameId:'preview',roundId,id:[roundId,target,key,text].join(':'),title:label+': '+text,
      ttlMs:category==='total'?2500:0,onRetired});
  },[roundId]);
  const lifecycle=useCallback((event:string)=>{if(event==='dispatchManyCalled')tripEvidence.dealAt=performance.now();},[]);
  return <CardTransportProvider gameId="preview" gameType="cribbage">
    <section ref={stage} data-current-hand={done?'next':'old'} data-canonical-felt-surface style={{position:'relative',height:540,background:'radial-gradient(ellipse,#235940,#102d23)',borderRadius:20,color:'white',overflow:'hidden'}}>
      <CanonicalAnnouncementLayer/>
      <p style={{position:'absolute',top:16,left:16}}>{done?'Hand 2 · Opening deal':'Hand 1 · Opponent’s final crib count'}</p>
      <div style={{position:'absolute',top:done?'52%':'78%',left:15,right:15}}><CribbagePegBoard players={players} playerStates={counted.playerStates} winningScore={121} overrideScores={scores} audioAward={null}/></div>
      {done?<DealRuntime handContextId={handContextId} gameType="cribbage">
        <DealtHands/>
        <CribbageDealOrchestrator gameId="preview" handContextId={handContextId} dealerPlayerId="p1" selfPlayerId="p1" seats={seats} cardsPerPlayer={6} selfHand={nextHand}
          dealerGameId="preview" roundId={handContextId} handNumber={2} onLifecycle={lifecycle}/>
      </DealRuntime>:<CribbageCountingPhase cribbageState={counted} players={players} countingTime={time}
        onCountingComplete={()=>{tripEvidence.completedAt=performance.now();setDone(true);}}
        onScoreUpdate={setScores} onAnnouncementChange={announce} initialScores={{p1:10,p2:20}}
        persistedTargetIndex={2} persistedBeatIndex={-1} persistedHandKey={roundId}
        cardBackColors={{color:'#123',darkColor:'#012'}} audioActive
        debugContext={{gameId:'preview',roundId,handNumber:1,userId:LAB_USER}}/>}
      <div ref={overlay} style={{position:'absolute',inset:0,pointerEvents:'none'}}/>
      <CardTransportRuntime containerRef={stage} overlayRootRef={overlay}/>
    </section>
  </CardTransportProvider>;
}
