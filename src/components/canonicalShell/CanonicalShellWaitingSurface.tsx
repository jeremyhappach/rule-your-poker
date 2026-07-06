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
import { Button } from "@/components/ui/button";
import { Share2, Bot, Loader2, Users } from "lucide-react";
import { useAnnouncements } from "@/lib/canonicalShell/announcements";
import {
  usePublishShellFelt,
  deriveFeltGameKind,
} from "@/lib/canonicalShell/ShellOwnedFeltHost";
import { ShellHudGrid } from "@/lib/canonicalShell/ShellHudGrid";
import {
  useShellTabBar,
  type ShellTabId,
} from "@/lib/canonicalShell/ShellTabBar";
// CHAT-ISO-B3: real MobileChatPanel visual DOM + local state, all mount-time external work disabled.
import { MobileChatPanelIsoB3 } from "@/components/MobileChatPanelIsoB3";
import { useChatAttention, useChatIconStyleGuard, chatAttentionToShellTabProps } from "@/hooks/ChatAttention";
import { useSeatAnchorsOptional } from "@/lib/canonicalShell/SeatAnchorLayer";
import { usePreSessionSeatOwned } from "@/lib/canonicalShell/PreSessionSeatLayer";

import { recordWartime } from "@/lib/wartimeDebug/core";

import { CanonicalSeatCluster } from "@/lib/canonicalShell/CanonicalSeatCluster";
import { getCanonicalSlotPlacement } from "@/lib/canonicalShell/canonicalSlotPlacement";
import { observerSlotForPosition } from "@/lib/canonicalShell/seatAnchors";
import { derivePlayerStatus } from "@/lib/canonicalShell/participantStatus";
import { getDisplayName } from "@/lib/botAlias";
import { formatChipValue } from "@/lib/utils";
import { formatChipBalance } from "@/lib/canonicalShell/chipBalanceFormat";
import { cn } from "@/lib/utils";
import {
  useWaitingMount,
  recordWaitingLifecycle,
  recordWaitingLifecycleIfChanged,
  recordSurfaceOwnership,
  recordSurfaceGeometry,
} from "@/lib/canonicalShell/waitingTableFlight";
import { recordPlayerVisualSnapshot, probeChipDom, probeChipDomAncestry } from "@/lib/wartimeDebug/surfaces";

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
// Canonical play/HUD partition: table region is the shell play region
// (--shell-play-h), HUD region is --shell-hud-h. They sum to the shell
// flex height by construction — same partition gameplay surfaces use.
// The felt ellipse (--shell-felt-h) is centered visually inside this
// region; the region itself MUST NOT shrink to the felt height.
const SHELL_TABLE_REGION_HEIGHT = "var(--shell-play-h)";


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

  // Waiting-table chat attention consumes the canonical ChatAttention
  // contract exactly like every gameplay surface. No local unread
  // derivation, no green flash, no bespoke timeout.
  const chatAttention = useChatAttention();
  useEffect(() => { chatAttention.notifyActiveTab(activeTab); }, [activeTab, chatAttention]);
  useChatIconStyleGuard(chatAttention.attentionState);
  const chatAttentionTabProps = chatAttentionToShellTabProps(chatAttention.attentionState);

  const handleOpenChatTab = () => {
    setActiveTab("chat");
    chatAttention.markChatRead('chat-tab-opened-actual-read');
  };

  usePublishShellFelt({
    gameKind: deriveFeltGameKind(gameType),
    anteAmount,
    isWaitingPhase: true,
    feltPlateMode: "BRAND",
    publisherLabel: "CanonicalShellWaitingSurface",
  });

  useShellTabBar({
    cardsIcon: "spade",
    activeTab,
    setActiveTab,
    onOpenChat: handleOpenChatTab,
    chatIndicator: chatAttentionTabProps.chatIndicator,
    chatFlashing: chatAttentionTabProps.chatFlashing,
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
  const preSessionSeatOwned = usePreSessionSeatOwned();
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
  // Runtime provider probe — replaces the prior hard-coded
  // 'PersistentTableShell.SeatAnchorLayer (SHELL)' literal. Traces now
  // report the actual ambient-provider presence so missing-provider
  // wiring failures cannot be masked by a string constant.
  const seatAnchorSourceLabel = ambient == null
    ? 'NONE (no ambient SeatAnchorLayer)'
    : 'SHELL (PersistentTableShell.SeatAnchorLayer)';



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
      anchorSnapshot[String(pos)] = { slot: a.slot };
    }
    recordSurfaceGeometry('WaitingTable', {
      geometryProviderId: 'ResponsiveGeometryProvider',
      seatAnchorSource: seatAnchorSourceLabel,
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
          chipValue: formatChipBalance(player.chips ?? 0),
          status,
          seatAnchorSource: seatAnchorSourceLabel,
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
        seatAnchorSource: seatAnchorSourceLabel,
        anchorProviderInstanceId: ambient?.providerInstanceId ?? null,
        chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
        chipRenderer: 'CanonicalSeatCluster',
        chipStyleSource: 'derivePlayerStatus → status palette',
        chipVariant: 'waiting',
        chipValue: formatChipBalance(player.chips ?? 0),
        status,
        projectionMode,
        isViewerSelf: player.user_id === currentUserId,
        isSuppressed: player.user_id === currentUserId,
        suppressionReason: player.user_id === currentUserId ? 'self-HOME' : null,
      };
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          recordPlayerVisualSnapshot({
            ..._baseSnap,
            ...probeChipDom(_pos),
            domAncestry: probeChipDomAncestry(_pos),
          });
        });
      } else {
        recordPlayerVisualSnapshot(_baseSnap);
      }
    }
  }, [players, byPosition, projectionMode, currentUserId]);



  const openPositions = ALL_POSITIONS.filter(
    (pos) => !players.some((p) => p.position === pos),
  );

  const viewerPlayer = useMemo(
    () => players.find((p) => p.user_id === currentUserId) ?? null,
    [players, currentUserId],
  );

  // Canonical announcement rail — "Waiting for Players" / "Ready to Start!".
  // Ambient for the whole waiting phase; cleared on unmount.
  const announcements = useAnnouncements();
  useEffect(() => {
    if (!gameId) return;
    const id = `${gameId}:waiting-table:${actions.hasEnoughPlayers ? 'ready' : 'waiting'}`;
    announcements.emit({
      id,
      type: 'waiting_for_players',
      scope: { dealerGameId: gameId },
      payload: {
        text: actions.hasEnoughPlayers ? 'Ready to Start!' : 'Waiting for Players',
        subtitle:
          actions.seatedPlayerCount > 0
            ? `${actions.seatedPlayerCount} ${actions.seatedPlayerCount === 1 ? 'player' : 'players'} seated`
            : undefined,
      },
    });
    return () => {
      announcements.clearAmbient('waiting_for_players');
    };
  }, [announcements, gameId, actions.hasEnoughPlayers, actions.seatedPlayerCount]);

  return (
    <div
      data-canonical-shell-waiting-surface=""
      data-shell-waiting-game-type={gameType}
      data-projection-mode={projectionMode}
      className="relative w-full h-full flex flex-col"
    >
      {/* Canonical play region — height owned by the shell via
          --shell-play-h. Sibling to the HUD region below; together
          they form the same partition gameplay surfaces use. */}
      <div
        data-canonical-shell-waiting-table-region=""
        className="relative"
        style={{
          height: SHELL_TABLE_REGION_HEIGHT,
          flex: `0 0 ${SHELL_TABLE_REGION_HEIGHT}`,
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
            {/* Occupied-seat layer — when the shell-owned
                PreSessionSeatLayer is mounted above (Wartime FIX #1),
                we DO NOT render local clusters; a single cluster set
                lives in the shell and survives every pre-session
                phase swap. Fallback path (shell layer absent) keeps
                the previous local cluster JSX so missing-shell
                wiring is recoverable rather than blank. */}
            {/* Viewer needing rejoin still has a `players` row at their
                old position (sitting_out=true), but they are NOT counted
                as a seated participant for the next hand. Treat their
                row as vacant for both the seat-cluster layer and the
                join affordance layer so the waiting table presents the
                same absolute seat availability as initial join. */}
            {(() => {
              const viewerRejoining =
                actions.viewerNeedsRejoin || actions.viewerIsWaitingToRejoin;
              const viewerPlayerLocal = viewerRejoining
                ? players.find((p) => p.user_id === currentUserId) ?? null
                : null;
              const isHiddenForRejoin = (p: Player) =>
                viewerPlayerLocal != null && p.id === viewerPlayerLocal.id;

              return (
                <>
                  {!preSessionSeatOwned && (
                    <div
                      data-canonical-shell-waiting-seats=""
                      className="absolute inset-0 z-20 pointer-events-none"
                    >
                      {players.map((player) => {
                        if (isHiddenForRejoin(player)) return null;
                        const anchor = byPosition.get(player.position);
                        if (!anchor) return null;
                        const actualUsername =
                          player.profiles?.username ?? (player.is_bot ? "Bot" : "Player");
                        const label = getDisplayName(players, player, actualUsername);
                        const status = derivePlayerStatus(player, null, {
                          hasStayDecision: false,
                        });

                        return (
                          <CanonicalSeatCluster
                            key={player.id}
                            slot={anchor.slot}
                            position={player.position}
                            name={label}
                            isDealer={false}
                            chipValue={formatChipBalance(player.chips ?? 0)}
                            status={status}
                            ownerLabel="Shell:CanonicalShellWaitingSurface"
                            playerId={player.id}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Open-seat join affordance layer — observers + rejoining viewer. */}
                  {(actions.isObserver || viewerRejoining) && (() => {
                    const occupiedSlots = new Set<number>();
                    for (const player of players) {
                      if (isHiddenForRejoin(player)) continue;
                      const slot = byPosition.get(player.position)?.slot;
                      if (slot != null) occupiedSlots.add(slot);
                    }
                    return (
                      <div
                        data-canonical-shell-waiting-open-seats=""
                        className="absolute inset-0 z-25"
                      >
                        {ALL_POSITIONS.map((pos) => {
                          const occupiedByPosition = players.some(
                            (p) => p.position === pos && !isHiddenForRejoin(p),
                          );
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
                </>
              );
            })()}


            {/* Passive felt message — "{N} Players Seated". No buttons;
                gameplay actions live in the Active Player Content Pane. */}
            <div
              data-canonical-shell-waiting-felt-message=""
              className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-30"
              style={{
                top: 24,
                height: SHELL_FELT_FRAME_HEIGHT,
              }}
            >
              <div className="bg-black/55 backdrop-blur-sm rounded-xl px-5 py-2.5 border border-amber-600/40">
                <p className="text-amber-200 font-semibold text-base tracking-wide">
                  {actions.seatedPlayerCount}{" "}
                  {actions.seatedPlayerCount === 1 ? "Player" : "Players"} Seated
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Canonical HUD region — sibling to the play region above.
          Height is shell-owned (--shell-hud-h); ShellHudGrid lives
          directly inside, no flex-1 spacer, no bespoke wrapper.
          Row 5 (identity) is shell-owned by ShellHudGrid. */}
      <div
        data-canonical-shell-waiting-hud-region=""
        className="bg-background"
        style={{
          height: 'var(--shell-hud-h)',
          flex: '0 0 var(--shell-hud-h)',
        }}
      >
        <ShellHudGrid
          timer={null}
          identity={
            viewerPlayer ? (
              <div className="w-full h-full flex items-center justify-center gap-2 px-3 overflow-hidden">
                <p className="text-sm font-semibold text-foreground truncate">
                  {getDisplayName(players, viewerPlayer, viewerPlayer.profiles?.username ?? "You")}
                </p>
                <span className={cn(
                  "font-bold text-lg tabular-nums",
                  (viewerPlayer.chips ?? 0) < 0 ? "text-destructive" : "text-poker-gold"
                )}>
                  ${formatChipValue(viewerPlayer.chips ?? 0)}
                </span>
              </div>
            ) : null
          }
          pane={
            <>
          {activeTab === "cards" && (
            <div className="h-full px-4 pt-3 pb-5 flex flex-col items-center justify-start gap-4">
              {/* Buttons sit immediately under the tab rail */}
              <div className="w-full flex flex-col items-center justify-start gap-3">
                {actions.isObserver || actions.viewerNeedsRejoin || actions.viewerIsWaitingToRejoin ? (
                  <>
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                      {openPositions.length > 0
                        ? "Tap a + on the table to take a seat."
                        : "Table is full."}
                    </p>
                    <Button
                      onClick={actions.handleInvite}
                      className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  </>
                ) : actions.isHost ? (
                  <>
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                      {actions.hasEnoughPlayers
                        ? "Ready when you are."
                        : "Add a bot or invite a friend to fill the table."}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        onClick={actions.handleInvite}
                        className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40"
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Invite
                      </Button>
                      {actions.hasOpenSeats && !realMoney && (
                        <Button
                          type="button"
                          disabled={actions.isAddingBot}
                          aria-busy={actions.isAddingBot}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            actions.handleAddBot();
                          }}
                          className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40 disabled:opacity-70"
                        >
                          {actions.isAddingBot ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Adding…
                            </>
                          ) : (
                            <>
                              <Bot className="w-4 h-4 mr-2" />
                              Add Bot
                            </>
                          )}
                        </Button>
                      )}
                      {actions.hasEnoughPlayers && (
                        <Button
                          data-start-game-btn
                          onClick={actions.handleStartGame}
                          className="bg-poker-chip-green hover:bg-poker-chip-green/80 text-white border-2 border-poker-chip-green font-bold shadow-lg shadow-black/40"
                        >
                          🃏 Start Game
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                      {actions.hasEnoughPlayers
                        ? "Waiting for host to start the game."
                        : "Share the table link to invite more players."}
                    </p>
                    <Button
                      onClick={actions.handleInvite}
                      className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  </>
                )}
              </div>

              {/* Identity is owned canonically by PreSessionSeatLayer →
                  CanonicalSeatCluster (felt). No bespoke identity row here. */}

            </div>
          )}

          {activeTab === "chat" && (
            <div className="h-full p-2 flex flex-col min-h-0">
              {/* CHAT-ISO-B3: real MobileChatPanel visual DOM + local
                  React state + composer + scroll + local mute state,
                  with ALL mount-time external work disabled (no
                  profiles fetch, no chatDeliveryLedger writes, no
                  window.dispatchEvent, no incident/export subtree, no
                  runtime tracer, no voice). */}
              <div className="text-[10px] font-mono text-white/40 mb-1 flex-shrink-0">
                CHAT-ISO-B3 — NO MOUNT EXTERNAL WORK
              </div>
              <div className="flex-1 min-h-0">
                {onSendChat ? (
                  <MobileChatPanelIsoB3
                    messages={allMessages ?? []}
                    onSend={onSendChat}
                    isSending={isChatSending}
                    currentUserId={currentUserId}
                    instrumentationCurrentUserId={currentUserId}
                    diagnosticGameId={gameId ?? null}
                    diagnosticDealerGameId={null}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-white/50 text-sm">
                    Chat not available
                  </div>
                )}
              </div>
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
            </>
          }
        />
      </div>
    </div>
  );
}
