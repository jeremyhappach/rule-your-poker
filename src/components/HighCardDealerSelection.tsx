/**
 * HighCardDealerSelection — legacy thin wrapper.
 *
 * Phase C.2 extraction: all logic moved to `useHighCardDealerSelection`.
 * This component is preserved ONLY for the remaining session-level
 * callsites in `Game.tsx` (pre-Cribbage, neutral shell territory). The
 * Cribbage dealer-game callsite uses the hook directly with no surface.
 *
 * Final retirement of this file is gated on the session-level dealer-
 * game-selection canonical migration, which is OUTSIDE Phase C scope
 * (Phase C is "once Cribbage is selected").
 */
import {
  useHighCardDealerSelection,
  type DealerSelectionCard,
  type DealerSelectionState,
} from '@/hooks/useHighCardDealerSelection';

export type { DealerSelectionCard, DealerSelectionState };

interface Player {
  id: string;
  user_id: string;
  position: number;
  created_at?: string;
  profiles?: { username: string };
  is_bot: boolean;
  sitting_out?: boolean;
}

interface HighCardDealerSelectionProps {
  gameId: string;
  players: Player[];
  onComplete: (dealerPosition: number) => void;
  isHost: boolean;
  allowBotDealers?: boolean;
  selectionVariant?: 'default' | 'cribbage';
  syncedState: DealerSelectionState | null;
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  onAnnouncementUpdate: (message: string | null, isComplete: boolean) => void;
  onWinnerPositionUpdate?: (position: number | null) => void;
}

export const HighCardDealerSelection = (props: HighCardDealerSelectionProps) => {
  useHighCardDealerSelection(props);
  // Headless: the actual rendering happens in MobileGameTable/GameTable via callbacks.
  return null;
};
