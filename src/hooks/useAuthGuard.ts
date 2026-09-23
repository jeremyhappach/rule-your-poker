/**
 * Centralised auth guard with tracing and transient-loss resilience.
 *
 * Problem solved:
 *   `onAuthStateChange` can fire with `session === null` on transient events
 *   (token refresh race, network blip, iOS BFCache restore).  The old code
 *   immediately navigated to /auth, kicking the user out mid-game.
 *
 * Fix:
 *   1. Honor SDK SIGNED_OUT/confirmed invalidation immediately; re-check
 *      transient null events without discarding recoverable table state.
 *   2. Log every auth state change to `debug_sync_events` for forensics.
 *   3. Preserve continuity during retryable connectivity failures.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { persistSyncDebugEvent } from "@/lib/persistSyncDebugEvent";
import {
  noteAuthRedirectAttempt,
  recordAuthStateChange,
  recordRouteRedirect,
} from "@/lib/authEjectionLedger";
import { getActiveRecoveryLease } from "@/lib/sessionRecoveryLease";
import { recordActiveSessionMarker, recordAppRouteRedirect } from "@/lib/runtimeInstrumentation/runtimeTracer";
import {
  peekIntentionalSignOut,
  recordAuthSessionInvalidationCause,
  installAuthStorageWatcher,
  type RefreshOutcome,
} from "@/lib/authInvalidationCause";
import { recordChatBoundaryEvent } from "@/lib/chatOperations/chatOperationBoundary";
import { isConfirmedSessionInvalidation } from "@/lib/authSession";

const TRANSIENT_RECHECK_MS = 1500; // wait before assuming session is truly gone

installAuthStorageWatcher();

/**
 * Routes that retain continuity during transient session loss. Confirmed
 * invalidation and SDK SIGNED_OUT bypass this recovery eligibility.
 */
function isProtectedTableRoute(path: string): boolean {
  return (
    path.startsWith("/game") ||
    path.startsWith("/waiting") ||
    path.startsWith("/table")
  );
}

function priorTokenLooksAlive(session: Session | null | undefined): boolean {
  if (!session?.expires_at) return false;
  return session.expires_at * 1000 - Date.now() > 30_000;
}


interface AuthGuardOptions {
  /** Additional context for trace events */
  pageLabel: string;
}

/**
 * Synchronously read the cached Supabase session from localStorage so
 * host-vs-non-host ownership is known on the very first render and the
 * shell does not snap from a non-host flash to host once the async
 * getSession() resolves. The supabase-js client persists sessions under
 * `sb-<projectref>-auth-token`; we tolerate either the flat or the
 * `currentSession`-wrapped shape and silently no-op on any error. The
 * async getSession() below remains authoritative for staleness/expiry.
 */
function readCachedUserSync(): User | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const u = parsed?.user ?? parsed?.currentSession?.user ?? null;
      if (u && typeof u === "object" && typeof u.id === "string") {
        return u as User;
      }
    }
  } catch {
    /* localStorage unavailable or session shape changed */
  }
  return null;
}

export function useAuthGuard({ pageLabel }: AuthGuardOptions) {
  const navigate = useNavigate();
  const cachedUser = useRef<User | null>(readCachedUserSync()).current;
  const [user, setUser] = useState<User | null>(cachedUser);
  const [isReady, setIsReady] = useState<boolean>(cachedUser !== null);
  const [authRecovering, setAuthRecovering] = useState<boolean>(false);
  const [authInvalidated, setAuthInvalidated] = useState(false);
  const prevAuthEvent = useRef<string | null>(null);
  const recheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKnownSessionRef = useRef<Session | null>(null);
  const reconcilingRef = useRef<boolean>(false);

  useEffect(() => {
    let mounted = true;
    let authRevision = 0;

    // ── helpers ──────────────────────────────────────────────
    function traceAuthEvent(
      eventName: string,
      payload: Record<string, unknown>,
    ) {
      persistSyncDebugEvent({
        gameId: "00000000-0000-0000-0000-000000000000",
        gameType: "auth",
        handNumber: 0,
        roundId: null,
      eventType: "transition",
      severity: eventName.includes("lost") || eventName.includes("failure")
        ? "warn"
        : "info",
        eventName,
        payload: {
          ...payload,
          route: window.location.pathname,
          page: pageLabel,
          visibilityState: document.visibilityState,
          online: navigator.onLine,
          ts: Date.now(),
        },
      });
    }

    /**
     * Synchronous pre-navigation eligibility. Returns the guard's decision
     * WITHOUT navigating. Callers must NOT navigate to /auth if this
     * returns "kept-route-*". The decision is recorded upstream by
     * `recordAuthSessionInvalidationCause`.
     */
    function evaluateRedirectEligibility(
      reason: string,
      priorSession: Session | null,
    ): "kept-route-recovering" | "kept-route-lease" | "redirected-no-session" | "redirected-intentional" {
      const intentional = peekIntentionalSignOut();
      if (intentional) return "redirected-intentional";
      const currentPath = window.location.pathname;
      const onProtected = isProtectedTableRoute(currentPath);
      const lease = getActiveRecoveryLease();
      const tokenAlive = priorTokenLooksAlive(priorSession);
      if (onProtected && (tokenAlive || lease)) {
        return lease && !tokenAlive ? "kept-route-lease" : "kept-route-recovering";
      }
      // Also protect explicitly on protected route even if we lack prior
      // session snapshot (e.g. cold-mount) — a lease alone is enough.
      if (onProtected && lease) return "kept-route-lease";
      return "redirected-no-session";
    }

    function performRedirectToAuth(reason: string, priorSession: Session | null) {
      if (!mounted) return;
      ++authRevision;
      lastKnownSessionRef.current = null;
      setUser(null);
      setIsReady(false);
      setAuthRecovering(false);
      setAuthInvalidated(true);
      if (recheckTimerRef.current) {
        clearTimeout(recheckTimerRef.current);
        recheckTimerRef.current = null;
      }
      const currentPath = window.location.pathname;
      const lease = getActiveRecoveryLease();
      noteAuthRedirectAttempt({
        caller: `useAuthGuard(${pageLabel})#performRedirectToAuth`,
        hasValidSession: priorTokenLooksAlive(priorSession),
        hasWaitingTableMembership: false,
        hasActiveRecoveryLease: !!lease,
        userId: priorSession?.user?.id ?? user?.id ?? null,
        dealerGameId: lease?.gameId ?? null,
        guardInputs: { reason, currentPath, pageLabel },
        note: "pre-navigation eligibility (synchronous)",
      });
      recordRouteRedirect({
        from: currentPath,
        to: "/auth",
        reason,
        caller: `useAuthGuard(${pageLabel})#performRedirectToAuth`,
        dealerGameId: lease?.gameId ?? null,
        playerId: user?.id ?? null,
      });
      traceAuthEvent("app-unexpected-navigation-login", {
        previousRoute: currentPath,
        nextRoute: "/auth",
        reason,
        authState: user ? "had-user" : "no-user",
      });
      sessionStorage.setItem("redirectAfterAuth", currentPath);
      try {
        recordAppRouteRedirect({
          from: currentPath,
          to: "/auth",
          reason,
          caller: `useAuthGuard(${pageLabel})#performRedirectToAuth`,
          initiator: "auth-guard",
          dealer_game_id: lease?.gameId ?? null,
        });
        recordActiveSessionMarker("ACTIVE_SESSION_ROUTE_EJECTED", {
          caller: `useAuthGuard(${pageLabel})#performRedirectToAuth`,
          branch: "auth-guard-redirect",
          prior_route: currentPath,
          next_route: "/auth",
          initiator: "auth-guard",
          dealer_game_id: lease?.gameId ?? null,
          extra: {
            reason,
            hasValidPriorSession: priorTokenLooksAlive(priorSession),
            hasActiveRecoveryLease: !!lease,
          },
        });
      } catch { /* noop */ }
      try {
        recordChatBoundaryEvent('AUTH_GUARD_REDIRECT', { reason, target: '/auth' });
      } catch { /* noop */ }
      navigate("/auth");
    }

    /**
     * Existing bounded recovery for transient null events. A confirmed
     * missing session overrides cached expiry and presentation leases.
     */
    async function reconcileUnexpectedSignOut(
      event: AuthChangeEvent,
      priorSession: Session | null,
    ): Promise<void> {
      if (reconcilingRef.current) return;
      reconcilingRef.current = true;
      setAuthRecovering(true);
      const revision = authRevision;

      const started = Date.now();
      let outcome: RefreshOutcome = "not-attempted";
      let refreshError: string | null = null;
      let recoveredSession: Session | null = null;
      let confirmedInvalidation = false;

      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          outcome = "error";
          refreshError = error.message;
          confirmedInvalidation = isConfirmedSessionInvalidation(error);
        } else if (data.session) {
          outcome = "recovered";
          recoveredSession = data.session;
        } else {
          // Fall back to a plain getSession in case another tab refreshed.
          const { data: probe, error: probeError } = await supabase.auth.getSession();
          if (probeError) {
            outcome = "error";
            refreshError = probeError.message;
            confirmedInvalidation = isConfirmedSessionInvalidation(probeError);
          } else if (probe.session) {
            outcome = "recovered";
            recoveredSession = probe.session;
          } else {
            outcome = "no-session";
          }
        }
      } catch (err) {
        outcome = "error";
        refreshError = err instanceof Error ? err.message : String(err);
        confirmedInvalidation = isConfirmedSessionInvalidation(err);
      }

      const finished = Date.now();
      if (!mounted || revision !== authRevision) { reconcilingRef.current = false; return; }

      if (recoveredSession) {
        lastKnownSessionRef.current = recoveredSession;
        setUser((prev) => (prev && prev.id === recoveredSession!.user.id ? prev : recoveredSession!.user));
        setIsReady(true);
        setAuthRecovering(false);
        traceAuthEvent("app-auth-session-recovered", {
          trigger: `reconcile-after-${event}`,
          userId: recoveredSession.user.id,
        });
        recordAuthSessionInvalidationCause({
          supabaseEvent: event,
          callbackLabel: `useAuthGuard(${pageLabel})`,
          priorTokenExpiresAt: priorSession?.expires_at ?? null,
          refreshTokenPresent: !!priorSession?.refresh_token,
          refreshAttempt: { startedAt: started, finishedAt: finished, outcome, error: refreshError },
          sessionNullTiming: "before-cleanup",
          recoveryGuardDecision: "kept-route-recovering",
          userId: priorSession?.user?.id ?? recoveredSession.user.id,
        });
        reconcilingRef.current = false;
        return;
      }

      // Reconciliation confirms no usable session. Evaluate eligibility
      // one more time (lease could have been released mid-reconcile).
      const decision = confirmedInvalidation
        ? "redirected-no-session"
        : outcome === "error" ? "kept-route-recovering"
        : evaluateRedirectEligibility(`reconciled-${event}`, priorSession);
      recordAuthSessionInvalidationCause({
        supabaseEvent: event,
        callbackLabel: `useAuthGuard(${pageLabel})`,
        priorTokenExpiresAt: priorSession?.expires_at ?? null,
        refreshTokenPresent: !!priorSession?.refresh_token,
        refreshAttempt: { startedAt: started, finishedAt: finished, outcome, error: refreshError },
        sessionNullTiming: "after-cleanup",
        recoveryGuardDecision: decision,
        userId: priorSession?.user?.id ?? null,
      });

      if (decision === "kept-route-recovering" || decision === "kept-route-lease") {
        // Stay put; another callback (SIGNED_IN / TOKEN_REFRESHED) will
        // resolve the recovering state, or lease teardown will handle it.
        reconcilingRef.current = false;
        return;
      }

      setAuthRecovering(false);
      performRedirectToAuth(`reconciled-no-session-${event}`, priorSession);
      reconcilingRef.current = false;
    }

    async function verifySessionOrRedirect(trigger: string) {
      // Double-check: maybe the token refreshed by now
      const revision = authRevision;
      const { data: { session: freshSession }, error } = await supabase.auth.getSession();
      if (!mounted || revision !== authRevision) return;
      if (error) {
        if (isConfirmedSessionInvalidation(error)) performRedirectToAuth(trigger, lastKnownSessionRef.current);
        else setAuthRecovering(true);
        return;
      }

      if (freshSession) {
        lastKnownSessionRef.current = freshSession;
        traceAuthEvent("app-auth-session-recovered", {
          trigger,
          userId: freshSession.user.id,
        });
        setUser(freshSession.user);
        setIsReady(true);
        setAuthRecovering(false);
      } else {
        traceAuthEvent("app-auth-session-lost", {
          trigger,
          previousUserId: user?.id ?? null,
          tokenRefreshInProgress: false,
        });
        const prior = lastKnownSessionRef.current;
        const decision = evaluateRedirectEligibility(trigger, prior);
        if (decision === "kept-route-recovering" || decision === "kept-route-lease") {
          // Hand off to reconcile path; do not navigate.
          void reconcileUnexpectedSignOut("USER_UPDATED" as AuthChangeEvent, prior);
          return;
        }
        performRedirectToAuth(trigger, prior);
      }
    }

    // ── initial session check ────────────────────────────────
    const initialRevision = authRevision;
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted || initialRevision !== authRevision) return;
      if (error) {
        if (isConfirmedSessionInvalidation(error)) performRedirectToAuth("initial-invalid-session", null);
        else setAuthRecovering(true);
        return;
      }
      if (!session) {
        traceAuthEvent("app-auth-session-lost", {
          trigger: "initial-getSession",
          previousUserId: null,
        });
        // Pre-navigation eligibility: on protected routes with an
        // active lease we must NOT eject during initial mount.
        const decision = evaluateRedirectEligibility("initial-no-session", null);
        if (decision === "kept-route-recovering" || decision === "kept-route-lease") {
          setAuthRecovering(true);
          void reconcileUnexpectedSignOut("INITIAL_SESSION" as AuthChangeEvent, null);
          return;
        }
        performRedirectToAuth("initial-no-session", null);
      } else {
        lastKnownSessionRef.current = session;
        setUser((prev) => (prev && prev.id === session.user.id ? prev : session.user));
        setIsReady(true);
        traceAuthEvent("app-auth-state-change", {
          oldState: "none",
          newState: "authenticated",
          triggerSource: "initial-getSession",
          userId: session.user.id,
        });
      }
    });

    // ── auth state subscription ──────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session) => {
        if (!mounted) return;

        const oldEvent = prevAuthEvent.current;
        prevAuthEvent.current = event;
        const priorSession = lastKnownSessionRef.current;

        recordAuthStateChange({
          previousState: oldEvent ?? "none",
          nextState: event,
          supabaseEvent: event,
          sessionBefore: !!user,
          sessionAfter: !!session,
          accessTokenExpiresAt: session?.expires_at ?? null,
          refreshTokenPresent: !!session?.refresh_token,
          userId: session?.user?.id ?? user?.id ?? null,
          callerLabel: `useAuthGuard(${pageLabel})#onAuthStateChange`,
        });

        traceAuthEvent("app-auth-state-change", {
          oldState: oldEvent ?? "none",
          newState: event,
          triggerSource: "onAuthStateChange",
          userId: session?.user?.id ?? null,
          hasSession: !!session,
        });


        if (session) {
          ++authRevision;
          setAuthInvalidated(false);
          if (recheckTimerRef.current) {
            clearTimeout(recheckTimerRef.current);
            recheckTimerRef.current = null;
          }
          lastKnownSessionRef.current = session;
          setUser((prev) => (prev && prev.id === session.user.id ? prev : session.user));
          setIsReady(true);
          setAuthRecovering(false);
        } else {
          if (event === "SIGNED_OUT") {
            // The SDK removes the session before SIGNED_OUT. Retryable
            // network failures do not emit this event. Neither an old JWT
            // expiry nor a presentation lease can restore authentication.
            const intentional = peekIntentionalSignOut();
            recordAuthSessionInvalidationCause({
              supabaseEvent: event,
              callbackLabel: `useAuthGuard(${pageLabel})`,
              priorTokenExpiresAt: priorSession?.expires_at ?? null,
              refreshTokenPresent: !!priorSession?.refresh_token,
              refreshAttempt: {
                startedAt: null,
                finishedAt: null,
                outcome: "not-attempted",
                error: null,
              },
              sessionNullTiming: "before-cleanup",
              recoveryGuardDecision: intentional ? "redirected-intentional" : "redirected-no-session",
              userId: priorSession?.user?.id ?? user?.id ?? null,
            });
            performRedirectToAuth(intentional ? "intentional-SIGNED_OUT" : "confirmed-SIGNED_OUT", priorSession);
          } else {
            // Transient null (TOKEN_REFRESHED race, etc.)
            traceAuthEvent("app-auth-session-lost", {
              trigger: `transient-null-event-${event}`,
              previousUserId: user?.id ?? null,
              tokenRefreshInProgress: true,
            });

            if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current);
            recheckTimerRef.current = setTimeout(() => {
              recheckTimerRef.current = null;
              verifySessionOrRedirect(`recheck-after-${event}`);
            }, TRANSIENT_RECHECK_MS);
          }
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (recheckTimerRef.current) {
        clearTimeout(recheckTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return { user, isReady, authRecovering, authInvalidated };
}
