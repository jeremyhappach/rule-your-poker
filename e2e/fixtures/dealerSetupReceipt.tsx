// Local-only browser fixture; not imported by the application or production build.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DealerGameSetup } from '../../src/components/DealerGameSetup';
import { useSessionDealerDrawReceipt } from '../../src/hooks/useSessionDealerDrawReceipt';
import { mergeAuthoritativeGameState } from '../../src/lib/authoritativeGameState';
import type { DealerSelectionState } from '../../src/hooks/useHighCardDealerSelection';
import '../../src/index.css';

const id = '320e2269-3c87-40a0-9a6e-b98b2617ffb5';
const playerId = '8ab161cb-176e-43fa-8283-d9b55a25ee8b';
const draw: DealerSelectionState = {
  cards: [{ playerId, position: 1, card: { rank: 'K', suit: '♥' },
    isRevealed: true, isWinner: true, isDimmed: false, roundNumber: 1 }],
  announcement: 'Dealer selected', isComplete: true, winnerPosition: 1,
  preparedAt: '2026-09-08T23:58:36.694226+00:00',
};
const waiting = { id, status: 'waiting', authority_revision: 1, dealer_selection_state: null as DealerSelectionState | null };
const selection = { ...waiting, status: 'dealer_selection', authority_revision: 3, dealer_selection_state: draw };
const setup = { ...selection, status: 'game_selection', authority_revision: 4 };
const deadline = new Date(Date.now() + 600_000).toISOString();

function Control() {
  const [game, setGame] = useState(new URLSearchParams(location.search).has('cold') ? setup : waiting);
  const [configured, setConfigured] = useState(false);
  const { receipt, completeReceipt } = useSessionDealerDrawReceipt(id, game);
  // Drive accepted records, including rejected old rows, without any live server writes.
  (window as any).dealerSetupControl = {
    deliver: (phase: 'waiting' | 'selection' | 'setup') => {
      const row = { waiting, selection, setup }[phase];
      setGame(current => mergeAuthoritativeGameState(current, row)!);
    },
    complete: () => receipt && completeReceipt(receipt.key),
  };
  return <main>
    {receipt && <div data-testid="pending-draw">Pending completed dealer draw</div>}
    {configured && <div data-testid="configured">Configured</div>}
    {!configured && game.status === 'game_selection' && !receipt && <DealerGameSetup
      gameId={id} dealerUsername="Fixture dealer" isBot={false}
      dealerPlayerId={playerId} dealerPosition={1} configDeadline={deadline}
      isFirstHand gameSetupTimerSeconds={600} anteDecisionTimerSeconds={30}
      activePlayerCount={2} activeHumanCount={2}
      onConfigComplete={() => setConfigured(true)} onSessionEnd={() => {}}
    />}
    {game.status === 'waiting' && <p>Waiting fixture ready</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Control />);
