/**
 * CanonicalShellWaitingSurface — Phase 3.1c.
 *
 * Single shared waiting surface for every canonical-shell family
 * (Cribbage / Gin Rummy / Yahtzee). Mounted inside the
 * `PersistentTableShell` children slot when `game.status === 'waiting'`.
 *
 * Architectural invariant satisfied:
 *
 *   - Zero new felt geometry. The shell-owned canonical ellipse is
 *     painted by `ShellOwnedFeltHost` already mounted at the shell
 *     boundary. This surface publishes felt context via
 *     `usePublishShellFelt({ isWaitingPhase: true, ... })` so the
 *     existing ellipse renders the correct title/subtitle from
 *     session entry onward.
 *
 *   - Zero sibling waiting tables. The legacy MobileGameTable-based
 *     `WaitingForPlayersTable` is NOT mounted on this path; only this
 *     thin overlay sits inside the shell slot.
 *
 *   - Single shared overlay behavior across families: the CTA is
 *     `WaitingRoomCTA` and the actions come from
 *     `useWaitingRoomActions`. Same two primitives drive the
 *     poker-variant `WaitingForPlayersTable`, so the surfaces cannot
 *     drift.
 */

import { useEffect } from "react";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  useWaitingRoomActions,
  type WaitingRoomActor,
} from "@/hooks/useWaitingRoomActions";
import { WaitingRoomCTA } from "@/components/canonicalShell/WaitingRoomCTA";
import {
  usePublishShellFelt,
  useShellFeltContext,
  deriveFeltGameKind,
} from "@/lib/canonicalShell/ShellOwnedFeltHost";
import { Button } from "@/components/ui/button";

interface Player extends WaitingRoomActor {
  id: string;
  chips: number;
  status: string;
  profiles?: { username?: string };
}

export interface CanonicalShellWaitingSurfaceProps {
  gameId: string;
  gameType: string | null;
  anteAmount?: number;
  players: Player[];
  currentUserId: string | undefined;
  onSelectSeat: (position: number) => void;
  onGameStart: () => void;
  onBotAdded?: () => void;
  realMoney?: boolean;
}

const ALL_POSITIONS = [1, 2, 3, 4, 5, 6, 7];

export function CanonicalShellWaitingSurface({
  gameId,
  gameType,
  anteAmount = 0,
  players,
  currentUserId,
  onSelectSeat,
  onGameStart,
  onBotAdded,
  realMoney = false,
}: CanonicalShellWaitingSurfaceProps) {
  useWakeLock(true);

  const { shellOwnsFelt } = useShellFeltContext();

  // Publish canonical felt context — drives the shell-owned ellipse
  // title ($ante <GameName>) and the "waiting" subtitle treatment.
  usePublishShellFelt(
    shellOwnsFelt
      ? {
          gameKind: deriveFeltGameKind(gameType),
          anteAmount,
          isWaitingPhase: true,
          publisherLabel: "CanonicalShellWaitingSurface",
        }
      : null,
  );

  const actions = useWaitingRoomActions({
    gameId,
    players,
    currentUserId,
    realMoney,
    onGameStart,
    onBotAdded,
  });

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info("[CanonicalShellWaitingSurface] mounted", {
      gameId,
      gameType,
      anteAmount,
      shellOwnsFelt,
    });
    return () => {
      // eslint-disable-next-line no-console
      console.info("[CanonicalShellWaitingSurface] unmounted", { gameId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occupiedPositions = new Set(players.map((p) => p.position));
  const openPositions = ALL_POSITIONS.filter(
    (pos) => !occupiedPositions.has(pos),
  );

  return (
    <div
      data-canonical-shell-waiting-surface=""
      data-shell-waiting-game-type={gameType}
      className="relative w-full h-full flex flex-col"
    >
      {/* Top region overlays the shell-owned ellipse. Pointer-events
          pass through except for the CTA box itself. */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <WaitingRoomCTA
            isObserver={actions.isObserver}
            isHost={actions.isHost}
            hasEnoughPlayers={actions.hasEnoughPlayers}
            hasOpenSeats={actions.hasOpenSeats}
            seatedPlayerCount={actions.seatedPlayerCount}
            realMoney={realMoney}
            isAddingBot={actions.isAddingBot}
            onInvite={actions.handleInvite}
            onAddBot={actions.handleAddBot}
            onStartGame={actions.handleStartGame}
          />
        </div>
      </div>

      {/* Bottom region — observer seat picker. Lives in the HUD band
          beneath the ellipse so it can't visually compete with the
          felt title. Hidden when the viewer is already seated. */}
      {actions.isObserver && openPositions.length > 0 && (
        <div
          data-canonical-shell-waiting-seat-picker=""
          className="px-4 py-3 border-t border-border bg-background/95 backdrop-blur-sm"
        >
          <p className="text-xs text-muted-foreground text-center mb-2 uppercase tracking-wider">
            Tap a seat to join
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {openPositions.map((pos) => (
              <Button
                key={pos}
                size="sm"
                variant="outline"
                onClick={() => onSelectSeat(pos)}
                className="border-amber-600/60 text-amber-300 hover:bg-amber-600/20"
              >
                Seat {pos}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
