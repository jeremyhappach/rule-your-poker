import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Settings, Sun } from 'lucide-react';
import { VisualPreferencesProvider } from '@/hooks/useVisualPreferences';
import { ResponsiveGeometryProvider } from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import { PersistentTableShell } from '@/lib/canonicalShell/PersistentTableShell';
import { CanonicalTableHeader } from '@/lib/canonicalShell/CanonicalTableHeader';
import { GameChatContextProvider } from '@/hooks/GameChatContext';
import { ChatAttentionProvider } from '@/hooks/ChatAttention';
import { MobileGameTable } from '@/components/MobileGameTable';
import { CribbageMobileGameTable } from '@/components/CribbageMobileGameTable';
import { CanonicalShellWaitingSurface } from '@/components/canonicalShell/CanonicalShellWaitingSurface';
import { createCountingClock } from '@/lib/cribbage/countingClock';
import { session, dealerGame, round, players } from './client';
import '@/index.css';

const params = new URLSearchParams(location.search);
const game = params.get('game') === 'cribbage' ? 'cribbage' : 'holm-game';
const noop = () => {};
const waitingBoundary = { status: 'waiting', current_game_uuid: null, pot: 0 };
const waitingPlayers = players.slice(0, params.get('state') === 'ready' || params.get('state') === 'observer' ? 2 : 1);
function WaitingFixture() {
  const observer = params.get('state') === 'observer';
  const viewer = observer ? '20000000-0000-4000-8000-000000000009' : players[0].user_id;
  return <PersistentTableShell gameId={session} lobbyMode anteAmount={0}
    viewerPosition={observer ? null : 1} viewerUserId={viewer} projectionMode={observer ? 'observer-absolute' : 'active-canonical'}
    seats={waitingPlayers.map(p=>({position:p.position,occupied:true}))} preSessionParticipants={waitingPlayers}
    header={<CanonicalTableHeader title="Nov 21 – Blue Hour"><button aria-label="Player options"><Settings size={16}/></button><button aria-label="Visual preferences"><Sun size={16}/></button></CanonicalTableHeader>}>
    <GameChatContextProvider value={{allMessages:[],isChatHydrated:true,hydrationBaselineIds:[],sendMessage:async()=>{},isSending:false} as any}>
      <ChatAttentionProvider currentUserId={viewer}>
        <CanonicalShellWaitingSurface gameId={session} gameType={null} players={waitingPlayers} currentUserId={viewer}
          currentHost={players[0].user_id} startBoundary={waitingBoundary} onSelectSeat={noop} onGameStart={noop}/>
      </ChatAttentionProvider>
    </GameChatContextProvider>
  </PersistentTableShell>;
}
function Fixture() {
  const [tab, setTab] = useState<any>('cards');
  const [clock] = useState(() => createCountingClock(noop));
  return <PersistentTableShell gameId={session} gameType={game} anteAmount={game==='cribbage'?10:3}
    viewerPosition={1} viewerUserId={players[0].user_id} projectionMode="active-canonical"
    seats={players.map(p=>({position:p.position,occupied:true}))}
    header={<CanonicalTableHeader title="Nov 21 – Blue Hour" gameplay><button aria-label="Player options"><Settings size={16}/></button><button aria-label="Visual preferences"><Sun size={16}/></button></CanonicalTableHeader>}>
    <GameChatContextProvider value={{allMessages:[],isChatHydrated:true,hydrationBaselineIds:[],sendMessage:async()=>{},isSending:false} as any}>
      <ChatAttentionProvider currentUserId={players[0].user_id}>
        {game==='cribbage' ? <CribbageMobileGameTable countingClock={clock} gameId={session} roundId={round}
          dealerGameId={dealerGame} handNumber={1} entryMode="historical-entry" players={players}
          currentUserId={players[0].user_id} dealerPosition={4} anteAmount={10} pot={20} isHost={false} onGameComplete={noop}/>
        : <MobileGameTable gameId={session} players={players} currentUserId={players[0].user_id} pot={6} currentRound={1}
          allDecisionsIn={false} playerCards={[{player_id:players[0].id,cards:[{rank:'4',suit:'spades'},{rank:'5',suit:'spades'},{rank:'6',suit:'clubs'},{rank:'8',suit:'clubs'}]}]}
          communityCards={[{rank:'J',suit:'clubs'},{rank:'Q',suit:'hearts'},{rank:'2',suit:'diamonds'},{rank:'3',suit:'clubs'}]}
          communityCardsRevealed={2} timeLeft={28} maxTime={30} lastRoundResult={null} dealerPosition={1} buckPosition={1}
          legValue={0} legsToWin={0} potMaxEnabled potMaxValue={15} pendingSessionEnd={false} awaitingNextRound={false}
          gameType="holm-game" gameStatus="in_progress" roundStatus="betting" holmDealerGameId={dealerGame} holmHandNumber={1}
          handContextId={round} currentTurnPosition={1} onStay={noop} onFold={noop} anteAmount={3}
          activeTab={tab} setActiveTab={setTab}/>}
      </ChatAttentionProvider>
    </GameChatContextProvider>
  </PersistentTableShell>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
  <VisualPreferencesProvider userId={players[0].user_id}><ResponsiveGeometryProvider>{params.get('game') === 'waiting' ? <WaitingFixture/> : <Fixture/>}</ResponsiveGeometryProvider></VisualPreferencesProvider>
</QueryClientProvider></MemoryRouter>);
