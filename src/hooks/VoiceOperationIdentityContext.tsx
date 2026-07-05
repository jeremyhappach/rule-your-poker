/**
 * VoiceOperationIdentityContext — canonical active game identity for voice ops.
 *
 * The prior approach (ambient tracer snapshot at op-open) proved unreliable:
 * on real operations the ambient game_id/session_id could still be NULL even
 * while the user was on `/game/:gameId`, so the resulting incident row had
 * no linkage and peer RLS export was impossible.
 *
 * This provider is mounted at the owning `Game.tsx` shell path and supplies
 * an immutable canonical identity object read directly by the composer and
 * `useVoiceToText`. Outside a game, the context returns an all-null identity
 * with `isActiveGameRoute=false` so the voice hook can distinguish waiting
 * table opens from active-game opens.
 */

import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import { recordRuntimeEvent } from "@/lib/runtimeInstrumentation/runtimeTracer";

export interface VoiceOperationIdentity {
  /** True iff this identity was produced by the Game.tsx shell mount. */
  isActiveGameRoute: boolean;
  /** Canonical shell game id (matches `/game/:gameId` route param). */
  gameId: string | null;
  /** Durable session identifier (tab session / shell session key). */
  sessionId: string | null;
  /** Current dealer game uuid. */
  dealerGameId: string | null;
  /** Sticky game type of the current shell. */
  gameType: string | null;
  /** Shell phase (dealer_selection / game_selection / configuring / in_progress …). */
  shellPhase: string | null;
  /** Active mobile tab (cards / chat / lobby / history) or null. */
  activeTab: string | null;
  /** Local player id at this shell. */
  localPlayerId: string | null;
}

const NULL_IDENTITY: VoiceOperationIdentity = {
  isActiveGameRoute: false,
  gameId: null,
  sessionId: null,
  dealerGameId: null,
  gameType: null,
  shellPhase: null,
  activeTab: null,
  localPlayerId: null,
};

const VoiceOperationIdentityContext =
  createContext<VoiceOperationIdentity>(NULL_IDENTITY);

export function VoiceOperationIdentityProvider({
  value,
  children,
}: {
  value: VoiceOperationIdentity;
  children: ReactNode;
}) {
  const stable = useMemo<VoiceOperationIdentity>(
    () => ({
      isActiveGameRoute: value.isActiveGameRoute,
      gameId: value.gameId,
      sessionId: value.sessionId,
      dealerGameId: value.dealerGameId,
      gameType: value.gameType,
      shellPhase: value.shellPhase,
      activeTab: value.activeTab,
      localPlayerId: value.localPlayerId,
    }),
    [
      value.isActiveGameRoute,
      value.gameId,
      value.sessionId,
      value.dealerGameId,
      value.gameType,
      value.shellPhase,
      value.activeTab,
      value.localPlayerId,
    ],
  );

  // Synthetic identity propagation check: on an active `/game/:gameId` route
  // the identity gameId MUST equal the route param. If it does not, emit the
  // DB-persisted invariant so the mismatch is visible to the server-side
  // finalizer and peer readers.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!stable.isActiveGameRoute) return;
    const path = window.location.pathname || "";
    const m = path.match(/^\/game\/([0-9a-f-]+)/i);
    const routeGameId = m ? m[1] : null;
    if (!routeGameId) return;
    if (stable.gameId && stable.gameId === routeGameId) return;
    try {
      recordRuntimeEvent({
        event_family: "voice",
        event_name: "VOICE_ACTIVE_GAME_IDENTITY_MISSING",
        severity: "error",
        payload: {
          route_game_id: routeGameId,
          shell_game_id: stable.gameId,
          dealer_game_id: stable.dealerGameId,
          session_id: stable.sessionId,
          game_type: stable.gameType,
          shell_phase: stable.shellPhase,
          active_tab: stable.activeTab,
          local_player_id: stable.localPlayerId,
          reason: stable.gameId ? "mismatch" : "null-shell-gameId",
        },
      });
    } catch { /* noop */ }
  }, [
    stable.isActiveGameRoute,
    stable.gameId,
    stable.dealerGameId,
    stable.sessionId,
    stable.gameType,
    stable.shellPhase,
    stable.activeTab,
    stable.localPlayerId,
  ]);

  return (
    <VoiceOperationIdentityContext.Provider value={stable}>
      {children}
    </VoiceOperationIdentityContext.Provider>
  );
}

export function useVoiceOperationIdentity(): VoiceOperationIdentity {
  return useContext(VoiceOperationIdentityContext);
}

/**
 * Non-microphone synthetic identity propagation check. Compares the identity
 * a consumer received (voice hook or composer) against the current route.
 * Emits `VOICE_ACTIVE_GAME_IDENTITY_MISSING` on mismatch. Returns whether
 * the check passed so callers/tests can gate downstream logic.
 */
export function assertVoiceIdentityMatchesRoute(
  identity: VoiceOperationIdentity,
  consumer: string,
): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname || "";
  const m = path.match(/^\/game\/([0-9a-f-]+)/i);
  const routeGameId = m ? m[1] : null;
  if (!routeGameId) {
    // Not on a game route → identity is expected to be null.
    return true;
  }
  const ok = Boolean(identity.gameId) && identity.gameId === routeGameId;
  if (!ok) {
    try {
      recordRuntimeEvent({
        event_family: "voice",
        event_name: "VOICE_ACTIVE_GAME_IDENTITY_MISSING",
        severity: "error",
        payload: {
          consumer,
          route_game_id: routeGameId,
          identity_game_id: identity.gameId,
          identity_dealer_game_id: identity.dealerGameId,
          identity_session_id: identity.sessionId,
          identity_game_type: identity.gameType,
          identity_shell_phase: identity.shellPhase,
          identity_active_tab: identity.activeTab,
          identity_local_player_id: identity.localPlayerId,
          reason: identity.gameId ? "mismatch" : "null",
        },
      });
    } catch { /* noop */ }
  }
  return ok;
}
