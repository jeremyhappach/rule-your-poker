/**
 * CanonicalShellWaitingSurface — Phase 3.1c / 3.1d.
 *
 * Single shared waiting surface for every canonical-shell family
 * (Cribbage / Gin Rummy / Yahtzee). Mounted inside the
 * `PersistentTableShell` children slot when `game.status === 'waiting'`.
 *
 * 3.1d/3.1e fixes:
 *   - CTA is anchored to the SHELL-OWNED ELLIPSE bounds (mirrors the
 *     ellipse geometry in `ShellOwnedFeltHost`), not to the slot-content
 *     center, so it visually sits in the table — not below it.
 *   - Mounts `<ShellHudChrome />` in the same order as canonical gameplay
 *     surfaces: persistent table region first, then rail/tabbar, then the
 *     active content pane. Chat/lobby/history swap ONLY in that bottom
 *     pane and never cover the shell-owned felt.
 *   - First-frame layout stability is owned by the bootstrap branch in
 *     `Game.tsx` (header + tabbar reservations).
 */

import { useEffect, useState } from "react";
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
import { ShellHudChrome } from "@/lib/canonicalShell/ShellHudChrome";
import {
  useShellTabBar,
  type ShellTabId,
} from "@/lib/canonicalShell/ShellTabBar";
import { MobileChatPanel } from "@/components/MobileChatPanel";
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
  /** Chat threading — keeps chat accessible during waiting (3.1d). */
  allMessages?: any[];
  onSendChat?: (text: string) => void | Promise<void>;
  isChatSending?: boolean;
}

const ALL_POSITIONS = [1, 2, 3, 4, 5, 6, 7];
const SHELL_FELT_FRAME_HEIGHT = "min(86vw, calc(55vh - 64px), 400px)";
const SHELL_TABLE_REGION_HEIGHT = `calc(24px + ${SHELL_FELT_FRAME_HEIGHT})`;

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
  allMessages = [],
  onSendChat,
  isChatSending = false,
}: CanonicalShellWaitingSurfaceProps) {
  useWakeLock(true);

  const { shellOwnsFelt } = useShellFeltContext();
  const [activeTab, setActiveTab] = useState<ShellTabId>("cards");

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

  // Publish tab-bar metadata so the shell-owned ShellTabBar mounts and
  // renders the canonical nav. Chat stays accessible from the lobby.
  useShellTabBar({
    cardsIcon: "spade",
    activeTab,
    setActiveTab,
  });

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
      className="relative w-full h-full flex flex-col flex-1 min-h-0"
    >
      {/* Persistent table region — mirrors canonical gameplay surfaces.
          The shell-owned felt remains visible for every tab; only the
          lower player-content pane swaps. */}
      <div
        data-canonical-shell-waiting-table-region=""
        className="relative flex-shrink-0"
        style={{
          height: SHELL_TABLE_REGION_HEIGHT,
          minHeight: 260,
        }}
      >
        {activeTab === "cards" && (
          <>
            {/* CTA stage — mirrors the shell-owned ellipse geometry
                (see ShellOwnedFeltHost: top: 24, height: min(86vw,
                calc(55vh - 64px), 400px)). Centering the CTA inside
                THIS box puts it visually at the ellipse center, not
                at the slot-content center. Pointer-events pass through
                except for the CTA card itself. */}
            <div
              data-canonical-shell-waiting-cta-stage=""
              className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-30"
              style={{
                top: 24,
                height: SHELL_FELT_FRAME_HEIGHT,
              }}
            >
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

          </>
        )}
      </div>

      {/* Unified bottom section — same shell-chrome/content-pane order as
          canonical gameplay tables. */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        <ShellHudChrome />

        <div className="flex-1 overflow-hidden min-h-0">
          {activeTab === "cards" && (
            <div className="h-full overflow-y-auto">
              {actions.isObserver && openPositions.length > 0 ? (
                <div
                  data-canonical-shell-waiting-seat-picker=""
                  className="px-4 py-3"
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
                      >
                        Seat {pos}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === "chat" && (
          <div className="h-full p-2">
            {onSendChat ? (
              <MobileChatPanel
                messages={allMessages}
                onSend={onSendChat}
                isSending={isChatSending}
                currentUserId={currentUserId}
              />
            ) : (
              <p className="text-muted-foreground text-sm text-center mt-6">
                Chat not available
              </p>
            )}
          </div>
          )}

          {activeTab === "lobby" && (
          <div className="h-full px-4 py-4 overflow-y-auto">
            <h3 className="text-sm font-bold text-foreground mb-3">
              Players ({players.length})
            </h3>
            <ul className="space-y-1">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-2"
                >
                  <span className="text-foreground">
                    {p.profiles?.username ?? "Player"}
                    {p.is_bot ? " (Bot)" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Seat {p.position}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          )}

          {activeTab === "history" && (
          <div className="h-full px-4 py-6 text-center text-muted-foreground text-sm">
            History will appear once the game starts.
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
