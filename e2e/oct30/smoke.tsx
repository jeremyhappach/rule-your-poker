import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameChatContextProvider } from '@/hooks/GameChatContext';
import { MobileGameTable } from '@/components/MobileGameTable';
import { PersistentTableShell } from '@/lib/canonicalShell/PersistentTableShell';
import { ResponsiveGeometryProvider } from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import { smokeDb, defaults } from './client';
import '@/index.css';
import { SUITS } from '@/lib/cardUtils';
import { Three57App } from './three57';
const viewer = Number(new URLSearchParams(location.search).get('viewer') ?? 0);
const roster = ['Hap','Lance','mcru81'].map((name, i) => ({ id:`p${i}`, user_id:`u${i}`, position:i+1, chips:20, chip_transfer_cursor:0, game_id:'local-session', status:'active', is_bot:false, sitting_out:false, legs:0, profiles:{username:name} }));
const cards = ['A','K','Q','J'].map((rank, i) => ({ rank, suit:SUITS[i] }));
smokeDb.rows = { games:[{ id:'local-session', pot:9, pot_transfer_cursor:0, current_game_uuid:'dealer', authority_revision:1 }], players:roster, gameplay_transfer_batches:[] };
const events:any[]=[];
function App() {
  const [done,setDone]=useState(false), [phase,setPhase]=useState<'idle'|'pot-to-winner'|'losers-to-pot'>('idle');
  const [next,setNext]=useState(false), [mount,setMount]=useState(0), [all,setAll]=useState(false);
  const [exposed,setExposed]=useState(true);
  const players=roster.map((p,i)=>({...p,current_decision:done&&exposed?(i===0&&!all?'fold':'stay'):null,decision_locked:done}));
  const publish=(allStay=all)=>{
    const batches=[{id:'award',cursor:1,reason:'win',transfers:[{id:'award-flight',from:{kind:'pot'},to:{kind:'player',playerId:'p1'},amount:9}],opening_balances:{pot:9,'player:p1':20},closing_balances:{pot:0,'player:p1':29}},
      {id:'replacement',cursor:2,reason:'transfer',transfers:[{id:'replacement-flight',from:{kind:'player',playerId:'p2'},to:{kind:'pot'},amount:9}],opening_balances:{pot:0,'player:p2':20},closing_balances:{pot:9,'player:p2':11}}].map(b=>({...b,game_id:'local-session',dealer_game_id:'dealer'}));
    if(allStay){const b=batches[1] as any;b.transfers.push({id:'replacement-self-flight',from:{kind:'player',playerId:'p0'},to:{kind:'pot'},amount:9});b.opening_balances['player:p0']=20;b.closing_balances['player:p0']=11;b.closing_balances.pot=18;}
    for(const b of batches){ if(!smokeDb.rows.gameplay_transfer_batches.some(x=>x.id===b.id))smokeDb.rows.gameplay_transfer_batches.push(b);smokeDb.emit('gameplay_transfer_batches','INSERT',b); }
    events.push({type:'authority-settled',at:Date.now()});
  };
  (window as any).__oct30={events,phase,next,settle:(allStay=false)=>{setAll(allStay);setDone(true);setPhase('pot-to-winner');publish(allStay);},exposure:(value:boolean)=>setExposed(value),defaults:()=>defaults.release(),remount:()=>setMount(n=>n+1),duplicate:publish};
  const props:any={gameId:'local-session',players,currentUserId:`u${viewer}`,pot:9,currentRound:1,allDecisionsIn:done,playerCards:players.map(p=>({player_id:p.id,cards})),timeLeft:30,lastRoundResult:done?'Lance won showdown|||WINNER:p1|||LOSERS:p2|||POT:9|||MATCH:9':null,dealerPosition:1,legValue:1,legsToWin:3,potMaxEnabled:false,potMaxValue:0,pendingSessionEnd:false,awaitingNextRound:done,gameType:'holm-game',anteAmount:3,gameStatus:'in_progress',roundStatus:done?'completed':'betting',communityCards:cards,communityCardsRevealed:done?4:2,chuckyActive:false,handContextId:'dealer|round-1|h1',holmDealerGameId:'dealer',holmHandNumber:1,holmEntryMode:'historical-entry',holmPresentationIdentity:{dealerGameId:'dealer',roundId:'round-1',handNumber:1,transferCursor:done?2:0},holmShowdownTriggerId:done?'showdown':null,holmShowdownWinnerIds:done?['p1']:[],holmShowdownLoserIds:done?(all?['p0','p2']:['p2']):[],holmShowdownMatchAmount:9,holmShowdownPhase:phase,onHolmShowdownPotToWinnerEnded:()=>setPhase('losers-to-pot'),onHolmShowdownLosersEnded:()=>setPhase('idle'),onHolmContinuationPresentationComplete:(identity:any)=>{events.push({type:'next-hand',at:Date.now(),identity,flights:document.querySelectorAll('[data-chip-transport-intent]').length});setNext(true);},onStay:()=>{},onFold:()=>{},isDealer:viewer===0};
  return <GameChatContextProvider value={{chatBubbles:[],allMessages:[],sendMessage:async()=>{},isSending:false,getPositionForUserId:()=>undefined,latestRealtimeMessage:null,isChatHydrated:true,hydrationBaselineIds:new Set(),chatConversationKey:null} as any}><ResponsiveGeometryProvider><PersistentTableShell gameId="local-session" projectionMode="active-canonical" seats={players} gameType="holm-game" anteAmount={3} viewerPosition={viewer+1} viewerUserId={`u${viewer}`}>{next?<div data-next-hand>Next hand admitted</div>:<MobileGameTable key={mount} {...props}/>}</PersistentTableShell></ResponsiveGeometryProvider></GameChatContextProvider>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>{new URLSearchParams(location.search).get('game')==='357'?<Three57App/>:<App/>}</QueryClientProvider></MemoryRouter>);
