/**
 * CanonicalShellWaitingSurface — canonical-shell waiting room.
 *
 * Single shared waiting surface for every canonical-shell family
 * (and for fresh sessions with no committed family yet). Consumes the
 * shell's canonical primitives instead of hand-rolling waiting-only
 * participant geometry:
 *
 *   - SeatAnchorLayer (mounted locally with the waiting roster) gives
 *     us the same projection-mode semantics as gameplay:
 *       observer/unjoined → 'observer-absolute'
 *       joined viewer     → 'active-canonical' (viewer at HOME)
 *   - CanonicalSeatCluster renders each occupied seat — slot
 *     anchoring, identity row, dealer pip, chip bubble — through the
 *     same primitive every gameplay surface uses.
 *   - participantStatus drives the chip-bubble fill via the shared
 *     four-state palette (active / waiting / sitting_out / stayed), so
 *     waiting yellow is the same yellow Mobile/Cribbage/Gin/Yahtzee
 *     consumers paint.
 *
 * Bespoke waiting-only seat geometry, color rules, self-suppression
 * branches, and bot/host label logic have all been removed in favor of
 * those primitives. Open-seat `+` join affordances are the only piece
 * that remains waiting-specific, and they are rendered through the
 * same `getCanonicalSlotPlacement` map the cluster uses — so their
 * placement is sourced from the canonical slot contract, not from a
 * second local map.
 */

import { useEffect, useMemo, useState } from "react";
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
import { SeatAnchorLayer, useSeatAnchors } from "@/lib/canonicalShell/SeatAnchorLayer";
import { CanonicalSeatCluster } from "@/lib/canonicalShell/CanonicalSeatCluster";
import { getCanonicalSlotPlacement } from "@/lib/canonicalShell/canonicalSlotPlacement";
import { observerSlotForPosition } from "@/lib/canonicalShell/seatAnchors";
import { derivePlayerStatus } from "@/lib/canonicalShell/participantStatus";
import { formatChipValue } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Player extends WaitingRoomActor {
  id: string;
  chips: number;
  status: string;
  waiting?: boolean | null;
  auto_fold?: boolean | null;
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

export function CanonicalShellWaitingSurface(
  props: CanonicalShellWaitingSurfaceProps,
) {
  // Derive projection inputs once so the local SeatAnchorLayer mount
  // gets the same canonical inputs every gameplay surface uses.
  const { players, currentUserId, gameId, gameType } = props;
  const viewer = players.find((p) => p.user_id === currentUserId);
  const isViewerSeated = !!viewer;
  const projectionMode = isViewerSeated
    ? "active-canonical"
    : "observer-absolute";
  const viewerPosition = isViewerSeated ? viewer!.position : null;

  // Roster fed to the canonical resolver. Waiting players ARE seated
  // for projection purposes — they're at their authoritative position
  // even though the hand hasn't committed them yet. This matches the
  // perspective semantics the user sees during gameplay: the viewer's
  // own seat is HOME (-1), others remap by clockwise distance.
  const seatInputs = useMemo(
    () =>
      players.map((p) => ({
        position: p.position,
        occupied: true,
        hidden: false,
      })),
    [players],
  );

  return (
    <SeatAnchorLayer
      projectionMode={projectionMode}
      viewerPosition={viewerPosition}
      seats={seatInputs}
      gameId={gameId}
      gameType={gameType ?? undefined}
    >
      <WaitingSurfaceBody {...props} />
    </SeatAnchorLayer>
  );
}

function WaitingSurfaceBody({
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
    onRejoinRequested: onBotAdded,
  });

  // Canonical seat resolver — same one every gameplay surface reads.
  // We never recompute slot math here; we read what the shell-owned
  // layer resolved.
  const { byPosition, projectionMode } = useSeatAnchors();

  // Host pip discrimination — host is the earliest-joined human (same
  // rule as `useWaitingRoomActions`). We surface it through the
  // canonical seat cluster's `isDealer` slot so the dealer/host pip
  // primitive stays single-sourced.
  const humanPlayers = players.filter((p) => !p.is_bot);
  const sortedHumans = [...humanPlayers].sort((a: any, b: any) => {
    if (!a.created_at || !b.created_at) return 0;
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
  const hostUserId = sortedHumans[0]?.user_id;

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info("[CanonicalShellWaitingSurface] mounted", {
      gameId,
      gameType,
      anteAmount,
      shellOwnsFelt,
      projectionMode,
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
      data-projection-mode={projectionMode}
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
            {/* Occupied-seat layer — every seat rendered through the
                canonical CanonicalSeatCluster primitive. Self (HOME,
                slot -1) is intentionally suppressed: once joined, the
                viewer is represented by the active-player content
                model, not by a duplicate on-table chipstack of
                themselves. */}
            <div
              data-canonical-shell-waiting-seats=""
              className="absolute inset-0 z-20 pointer-events-none"
            >
              {players.map((player) => {
                const anchor = byPosition.get(player.position);
                if (!anchor) return null;
                // Self-suppression is handled by CanonicalSeatCluster
                // via the SeatAnchorLayer viewerPosition context.


                const label =
                  player.profiles?.username ??
                  (player.is_bot ? "Bot" : "Player");
                const status = derivePlayerStatus(player, null, {
                  // No stay/fold decisions exist in waiting; the
                  // derivation will resolve to 'waiting' or
                  // 'sitting_out' / 'active' based on player fields.
                  hasStayDecision: false,
                });

                return (
                  <CanonicalSeatCluster
                    key={player.id}
                    slot={anchor.slot}
                    position={player.position}
                    name={`${label}${player.is_bot ? " 🤖" : ""}`}
                    isDealer={player.user_id === hostUserId}
                    chipValue={formatChipValue(player.chips ?? 0)}
                    status={status}
                  />
                );
              })}
            </div>

            {/* Open-seat join affordance layer — observers only.
                Placement is sourced from the SAME canonical slot
                placement map the cluster uses (observerSlotForPosition
                + getCanonicalSlotPlacement) so the geometry stays
                single-sourced. Joined viewers cannot re-pick seats
                from waiting. */}
            {actions.isObserver && (
              <div
                data-canonical-shell-waiting-open-seats=""
                className="absolute inset-0 z-25"
              >
                {ALL_POSITIONS.map((pos) => {
                  const occupied = players.some((p) => p.position === pos);
                  if (occupied) return null;
                  const slot = observerSlotForPosition(pos);
                  if (slot == null) return null;
                  const placement = getCanonicalSlotPlacement(slot, 'open-seat');
                  return (
                    <div
                      key={pos}
                      className={cn(
                        "absolute pointer-events-auto",
                        placement.className,
                      )}
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
            )}

            {/* CTA stage — sits on top of the seat layers, centered in
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
