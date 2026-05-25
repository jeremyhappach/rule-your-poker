/**
 * CanonicalShellWaitingSurface — Phase 3.1c / 3.1d / 3.1e.
 *
 * Single shared waiting surface for every canonical-shell family
 * (Cribbage / Gin Rummy / Yahtzee). Mounted inside the
 * `PersistentTableShell` children slot when `game.status === 'waiting'`.
 *
 * Restores absolute seat-presence visualization on the shell-owned
 * felt: occupied seats render chipstacks with the player's username,
 * and (for observers) open seats render circular `+` join affordances.
 * The active content pane no longer holds a seat-button fallback —
 * seat selection is exclusively driven by the on-felt affordances.
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
import { ChipStack } from "@/components/ChipStack";

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
  allMessages?: any[];
  onSendChat?: (text: string) => void | Promise<void>;
  isChatSending?: boolean;
}

const ALL_POSITIONS = [1, 2, 3, 4, 5, 6, 7];
const SHELL_FELT_FRAME_HEIGHT = "min(86vw, calc(55vh - 64px), 400px)";
const SHELL_TABLE_REGION_HEIGHT = `calc(24px + ${SHELL_FELT_FRAME_HEIGHT})`;

/**
 * Absolute seat positions around the shell-owned ellipse. Mirrors the
 * mapping used by MobileGameTable so observer seat-selection geometry
 * stays consistent between the legacy poker waiting surface and the
 * canonical shell waiting surface.
 */
const ABSOLUTE_SEAT_CLASSES: Record<number, string> = {
  1: "top-2 left-10",
  2: "top-1/2 -translate-y-1/2 left-1",
  3: "bottom-2 left-10",
  4: "bottom-2 left-1/2 -translate-x-1/2",
  5: "bottom-2 right-10",
  6: "top-1/2 -translate-y-1/2 right-1",
  7: "top-2 right-10",
};

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

  const openPositions = ALL_POSITIONS.filter(
    (pos) => !players.some((p) => p.position === pos),
  );

  return (
    <div
      data-canonical-shell-waiting-surface=""
      data-shell-waiting-game-type={gameType}
      className="relative w-full h-full flex flex-col flex-1 min-h-0"
    >
      {/* Persistent table region — mirrors canonical gameplay surfaces. */}
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
            {/* Absolute seat-presence layer — restores multiplayer
                awareness in waiting. Renders occupied seats as
                chipstacks and (for observers) open seats as + join
                affordances. Mirrors the geometry MobileGameTable uses
                for the legacy poker waiting surface. */}
            <div
              data-canonical-shell-waiting-seats=""
              className="absolute inset-0 z-20 pointer-events-none"
            >
              {ALL_POSITIONS.map((pos) => {
                const player = players.find((p) => p.position === pos);
                const positionClass =
                  ABSOLUTE_SEAT_CLASSES[pos] ?? ABSOLUTE_SEAT_CLASSES[1];

                if (player) {
                  const isSelf = player.user_id === currentUserId;
                  const label =
                    player.profiles?.username ??
                    (player.is_bot ? "Bot" : "Player");
                  return (
                    <div
                      key={pos}
                      className={`absolute ${positionClass} flex flex-col items-center gap-1`}
                      data-waiting-seat-occupied={pos}
                    >
                      <ChipStack
                        amount={player.chips ?? 0}
                        size="sm"
                        playerStatus="waiting"
                      />
                      <span
                        className={`text-[10px] font-medium max-w-[68px] truncate px-1.5 py-0.5 rounded ${
                          isSelf
                            ? "bg-amber-600/80 text-black"
                            : "bg-black/60 text-amber-200"
                        }`}
                      >
                        {label}
                        {player.is_bot ? " 🤖" : ""}
                      </span>
                    </div>
                  );
                }

                if (!actions.isObserver) return null;

                return (
                  <div
                    key={pos}
                    className={`absolute ${positionClass} pointer-events-auto`}
                    data-waiting-seat-open={pos}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSeat(pos)}
                      aria-label={`Take seat ${pos}`}
                      className="w-12 h-12 rounded-full bg-amber-900/40 border-2 border-dashed border-amber-600/70 flex items-center justify-center hover:bg-amber-800/60 hover:border-amber-500 transition-all active:scale-95"
                    >
                      <span className="text-amber-300 text-xl leading-none">
                        +
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* CTA stage — sits on top of the seat layer, centered in
                the ellipse. */}
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

      {/* Unified bottom section — same shell-chrome/content-pane order
          as canonical gameplay tables. */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        <ShellHudChrome />

        <div className="flex-1 overflow-hidden min-h-0">
          {activeTab === "cards" && (
            <div className="h-full px-4 py-3 text-center text-xs text-muted-foreground">
              {actions.isObserver
                ? openPositions.length > 0
                  ? "Tap a + on the table to take a seat."
                  : "Table is full."
                : "You're seated. Waiting for the host to start the game."}
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
