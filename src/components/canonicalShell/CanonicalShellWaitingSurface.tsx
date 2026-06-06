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

import { useEffect, useState } from "react";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  useWaitingRoomActions,
  type WaitingRoomActor,
} from "@/hooks/useWaitingRoomActions";
import { WaitingRoomCTA } from "@/components/canonicalShell/WaitingRoomCTA";
import {
  usePublishShellFelt,
  deriveFeltGameKind,
} from "@/lib/canonicalShell/ShellOwnedFeltHost";
import { ShellHudChrome } from "@/lib/canonicalShell/ShellHudChrome";
import {
  useShellTabBar,
  type ShellTabId,
} from "@/lib/canonicalShell/ShellTabBar";
import { MobileChatPanel } from "@/components/MobileChatPanel";
import { useSeatAnchorsOptional } from "@/lib/canonicalShell/SeatAnchorLayer";
import { recordWartime } from "@/lib/wartimeDebug/core";

import { CanonicalSeatCluster } from "@/lib/canonicalShell/CanonicalSeatCluster";
import { getCanonicalSlotPlacement } from "@/lib/canonicalShell/canonicalSlotPlacement";
import { observerSlotForPosition } from "@/lib/canonicalShell/seatAnchors";
import { derivePlayerStatus } from "@/lib/canonicalShell/participantStatus";
import { getDisplayName } from "@/lib/botAlias";
import { formatChipValue } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  useWaitingMount,
  recordWaitingLifecycle,
  recordWaitingLifecycleIfChanged,
  recordSurfaceOwnership,
  recordSurfaceGeometry,
} from "@/lib/canonicalShell/waitingTableFlight";
import { recordPlayerVisualSnapshot, probeChipDom } from "@/lib/wartimeDebug/surfaces";

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
const SHELL_FELT_FRAME_HEIGHT = "var(--shell-felt-h)";
const SHELL_TABLE_REGION_HEIGHT = "var(--shell-felt-h)";


export function CanonicalShellWaitingSurface(
  props: CanonicalShellWaitingSurfaceProps,
) {
  // P0 (chip-continuity fix): canonical pre-session surfaces consume
  // the SHELL-OWNED SeatAnchorLayer mounted in PersistentTableShell
  // via Game.tsx. The previous local SeatAnchorLayer wrap forked seat
  // identity from NeutralInterstitial — every slot transition
  // remounted the provider and reinitialized CanonicalSeatCluster,
  // which read as a visible chip jump. There is no local fallback:
  // missing ambient provider is a shell wiring contract violation and
  // is recorded as such for diagnosis.
  return <WaitingSurfaceBody {...props} />;
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

  const [activeTab, setActiveTab] = useState<ShellTabId>("cards");

  usePublishShellFelt({
    gameKind: deriveFeltGameKind(gameType),
    anteAmount,
    isWaitingPhase: true,
    publisherLabel: "CanonicalShellWaitingSurface",
  });

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

  // Canonical seat resolver — shell-owned (PersistentTableShell).
  // No local provider; contract violation is recorded if missing so
  // wiring failures surface in Wartime instead of silently rendering
  // empty seats.
  const ambient = useSeatAnchorsOptional();
  useEffect(() => {
    if (!ambient) {
      recordWartime('SEATING', 'contract-violation.missing-seat-anchor-provider', {
        surface: 'CanonicalShellWaitingSurface',
        gameId,
        gameType,
        hint: 'shell SeatAnchorLayer not mounted above this surface',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient == null]);
  const byPosition = ambient?.byPosition ?? new Map();
  const projectionMode = ambient?.projectionMode ?? 'observer-absolute';


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
      projectionMode,
    });
    return () => {
      // eslint-disable-next-line no-console
      console.info("[CanonicalShellWaitingSurface] unmounted", { gameId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Waiting-table flight recorder (instrumentation only) ────────
  useWaitingMount('WaitingTable', {
    impl: 'CanonicalShellWaitingSurface',
    gameId,
    gameType,
    anteAmount,
    projectionMode,
  });
  useEffect(() => {
    recordWaitingLifecycle('WaitingTable ready (canonical)', {
      gameId,
      gameType,
      anteAmount,
      projectionMode,
      playerCount: players.length,
      seatedCount: players.filter(p => p.position != null).length,
      hostUserId: hostUserId?.slice(0, 8) ?? null,
      isViewerSeated: !!players.find(p => p.user_id === currentUserId),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    recordSurfaceOwnership('WaitingTable', {
      SeatOwner: 'Shell:CanonicalSeatCluster',
      ChipOwner: 'Shell:CanonicalSeatCluster.chipValue',
      ControlOwner: 'Slot:WaitingRoomCTA (Invite/AddBot/Start)',
      AnnouncementOwner: 'Shell:ShellHudChrome → CanonicalAnnouncementLayer',
      HUDOwner: 'Shell:ShellHudChrome',
    }, { gameId, impl: 'CanonicalShellWaitingSurface' });
  }, [gameId]);
  useEffect(() => {
    const anchorSnapshot: Record<string, unknown> = {};
    for (const [pos, a] of byPosition) {
      anchorSnapshot[String(pos)] = { slot: a.slot, canonicalized2p: a.canonicalized2p };
    }
    recordSurfaceGeometry('WaitingTable', {
      geometryProviderId: 'ResponsiveGeometryProvider',
      seatAnchorSource: 'PersistentTableShell.SeatAnchorLayer (SHELL)',
      chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
      chipStyleSource: 'derivePlayerStatus → status palette',
      projectionMode,
      viewerPosition: players.find(p => p.user_id === currentUserId)?.position ?? null,
      anchorSnapshot,
    }, { gameId });
  }, [gameId, projectionMode, byPosition, players, currentUserId]);

  // P-WAIT.B1: per-seat chip-glyph render trace. Signature-keyed so we
  // emit only when the rendered chip identity changes.
  useEffect(() => {
    const viewerPos = players.find(p => p.user_id === currentUserId)?.position ?? null;
    for (const player of players) {
      const anchor = byPosition.get(player.position);
      if (!anchor) continue;
      const status = derivePlayerStatus(player as any, null, { hasStayDecision: false });
      recordWaitingLifecycleIfChanged(
        `chipglyph:WaitingTable:${player.id}`,
        'chip-glyph render',
        {
          surface: 'WaitingTable',
          renderer: 'CanonicalSeatCluster.chipValue',
          position: player.position,
          slot: anchor.slot,
          playerId: player.id,
          userId: player.user_id,
          name: player.profiles?.username ?? (player.is_bot ? 'Bot' : 'Player'),
          chipValue: `$${formatChipValue(player.chips ?? 0)}`,
          status,
          seatAnchorSource: 'PersistentTableShell.SeatAnchorLayer (SHELL)',
          chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
          chipStyleSource: 'derivePlayerStatus → status palette',
          projectionMode,
          viewerPosition: viewerPos,
        },
      );
      // Wartime: cross-surface player visual snapshot (auto-diffs against
      // NeutralInterstitial / DealerSelection snapshots for same playerId).
      // Defer to next frame so the chip DOM is laid out when probed.
      const _pos = player.position;
      const _baseSnap = {
        surface: 'WaitingTable' as const,
        playerId: player.id,
        userId: player.user_id,
        position: player.position,
        viewerPosition: viewerPos,
        logicalSeat: player.position,
        renderedSeatSlot: anchor.slot,
        seatAnchorSource: 'PersistentTableShell.SeatAnchorLayer (SHELL)',
        chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
        chipRenderer: 'CanonicalSeatCluster',
        chipStyleSource: 'derivePlayerStatus → status palette',
        chipVariant: 'waiting',
        chipValue: `$${formatChipValue(player.chips ?? 0)}`,
        status,
        projectionMode,
        isViewerSelf: player.user_id === currentUserId,
        isSuppressed: player.user_id === currentUserId,
        suppressionReason: player.user_id === currentUserId ? 'self-HOME' : null,
      };
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          recordPlayerVisualSnapshot({ ..._baseSnap, ...probeChipDom(_pos) });
        });
      } else {
        recordPlayerVisualSnapshot(_baseSnap);
      }
    }
  }, [players, byPosition, projectionMode, currentUserId]);



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


                const actualUsername =
                  player.profiles?.username ?? (player.is_bot ? "Bot" : "Player");
                const label = getDisplayName(players, player, actualUsername);
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
                    name={label}
                    isDealer={player.user_id === hostUserId}
                    chipValue={`$${formatChipValue(player.chips ?? 0)}`}
                    status={status}
                  />
                );
              })}
            </div>

            {/* Open-seat join affordance layer — observers only.
                Placement is sourced from the SAME canonical slot
                placement map the cluster uses, AND filtered against
                the SAME resolved-slot occupancy the cluster reads.
                A `+` is suppressed when EITHER the position is taken
                OR the resolved canonical slot already hosts a seat
                cluster — single-sourcing the geometry so a `+` can
                never sit underneath an occupied chipstack. */}
            {actions.isObserver && (() => {
              // Resolved-slot occupancy from the SAME anchor map the
              // cluster layer reads. Any slot in this set already has
              // a player cluster painted on it; the `+` MUST be
              // suppressed there regardless of which raw position
              // mapped to it.
              const occupiedSlots = new Set<number>();
              for (const player of players) {
                const slot = byPosition.get(player.position)?.slot;
                if (slot != null) occupiedSlots.add(slot);
              }
              return (
                <div
                  data-canonical-shell-waiting-open-seats=""
                  className="absolute inset-0 z-25"
                >
                  {ALL_POSITIONS.map((pos) => {
                    const occupiedByPosition = players.some((p) => p.position === pos);
                    if (occupiedByPosition) return null;
                    const slot = observerSlotForPosition(pos);
                    if (slot == null) return null;
                    if (occupiedSlots.has(slot)) return null;
                    const placement = getCanonicalSlotPlacement(slot, 'open-seat');
                    return (
                      <div
                        key={pos}
                        className={cn(
                          "absolute pointer-events-auto",
                          placement.className,
                        )}
                        data-waiting-seat-open={pos}
                        data-waiting-seat-slot={slot}
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
              );
            })()}

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
                viewerNeedsRejoin={actions.viewerNeedsRejoin}
                viewerIsWaitingToRejoin={actions.viewerIsWaitingToRejoin}
                isRejoining={actions.isRejoining}
                onInvite={actions.handleInvite}
                onAddBot={actions.handleAddBot}
                onStartGame={actions.handleStartGame}
                onRejoin={actions.handleRejoin}
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
                      {getDisplayName(players, p, p.profiles?.username ?? "Player")}
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
