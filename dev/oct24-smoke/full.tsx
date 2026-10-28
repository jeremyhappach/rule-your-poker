import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { VisualPreferencesProvider } from '@/hooks/useVisualPreferences';
import { ResponsiveGeometryProvider } from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import { PersistentTableShell } from '@/lib/canonicalShell/PersistentTableShell';
import { CanonicalTableHeader } from '@/lib/canonicalShell/CanonicalTableHeader';
import { GameChatContextProvider } from '@/hooks/GameChatContext';
import { ChatAttentionProvider } from '@/hooks/ChatAttention';
import { MobileGameTable } from '@/components/MobileGameTable';
import '@/index.css';

const positions = new URLSearchParams(location.search).has('fullSeats') ? [1,2,3,4,5,6] : [1,3,5];
const players = positions.map((position,index) => ({
 id: '10000000-0000-4000-8000-00000000000'+index,
 user_id: '20000000-0000-4000-8000-00000000000'+index,
 position, chips:100, status:'active', current_decision:null, decision_locked:false,
 legs:0, is_bot:false, sitting_out:false, profiles:{username:['Viewer','Roller','Third','Fourth','Fifth','Sixth'][index]},
}));
function Fixture() {
 const [held,setHeld] = useState(0);
 const dice = [6,5,4,3,2].map((value,index)=>({value,isHeld:index<held,isSCC:index<Math.min(held,3),
  sccType:index<Math.min(held,3)?(['ship','captain','crew'] as const)[index]:undefined}));
 const state = {gamePhase:'playing' as const,currentTurnPlayerId:players[1].id,
  turnOrder:players.map(p=>p.id),actionSequence:held+1,
  playerStates:{[players[1].id]:{dice,rollsRemaining:held?1:2,isComplete:false,rollKey:held+1}}};
 return <PersistentTableShell gameType="ship-captain-crew" anteAmount={2}
  viewerPosition={1} viewerUserId={players[0].user_id} projectionMode="active-canonical"
  seats={players.map(p=>({position:p.position,occupied:true}))}
  header={<CanonicalTableHeader title="Ship Captain Crew" subtitle="Offline shell qualification" />}>
  <GameChatContextProvider value={{allMessages:[],isChatHydrated:true,hydrationBaselineIds:[],sendMessage:async()=>{},isSending:false} as any}>
   <ChatAttentionProvider currentUserId={players[0].user_id}>
    <MobileGameTable players={players} currentUserId={players[0].user_id}
     pot={6} currentRound={1} allDecisionsIn={false} playerCards={[]} timeLeft={25}
     lastRoundResult={null} dealerPosition={5} legValue={0} legsToWin={0}
     potMaxEnabled={false} potMaxValue={0} pendingSessionEnd={false} awaitingNextRound={false}
     gameType="ship-captain-crew" gameStatus="in_progress" roundStatus="betting"
     horsesRoundId="30000000-0000-4000-8000-000000000001" horsesHandNumber={1}
     horsesState={state} currentTurnPosition={players[1].position} onStay={()=>{}} onFold={()=>{}}
     anteAmount={2} realMoney isPaused activeTab="cards" />
   </ChatAttentionProvider>
  </GameChatContextProvider>
  <button data-test-next-roll style={{position:'fixed',bottom:0,right:0,zIndex:999}} onClick={()=>setHeld((held+1)%6)}>Next roll</button>
 </PersistentTableShell>;
}
createRoot(document.getElementById('root')!).render(
 <MemoryRouter><QueryClientProvider client={new QueryClient()}>
  <VisualPreferencesProvider userId={null}><ResponsiveGeometryProvider><Fixture/></ResponsiveGeometryProvider></VisualPreferencesProvider>
 </QueryClientProvider></MemoryRouter>);
