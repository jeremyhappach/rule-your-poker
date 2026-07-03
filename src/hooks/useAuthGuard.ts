/**
 * Centralised auth guard with tracing and transient-loss resilience.
 *
 * Problem solved:
 *   `onAuthStateChange` can fire with `session === null` on transient events
 *   (token refresh race, network blip, iOS BFCache restore).  The old code
 *   immediately navigated to /auth, kicking the user out mid-game.
 *
 * Fix:
 *   1. Distinguish real SIGNED_OUT from transient null by re-checking
 *      `getSession()` after a short delay.
 *   2. Log every auth state change to `debug_sync_events` for forensics.
 *   3. Never redirect while a token refresh is plausibly in progress.
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
import {
  peekIntentionalSignOut,
  recordAuthSessionInvalidationCause,
  installAuthStorageWatcher,
  type RefreshOutcome,
} from "@/lib/authInvalidationCause";

const TRANSIENT_RECHECK_MS = 1500; // wait before assuming session is truly gone

installAuthStorageWatcher();

/**
 * Routes on which an unexpected SIGNED_OUT should NOT immediately eject
 * the user. On these routes we hold the current location, attempt one
 * canonical refresh, and only navigate to /auth if reconciliation
 * definitively confirms no usable session.
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
  const prevAuthEvent = useRef<string | null>(null);
  const recheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

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

    function redirectToAuth(reason: string) {
      if (!mounted) return;
      const currentPath = window.location.pathname;
      // Wartime: probe for suspicious redirect (valid session or lease).
      supabase.auth.getSession().then(({ data: { session: probe } }) => {
        const lease = getActiveRecoveryLease();
        noteAuthRedirectAttempt({
          caller: `useAuthGuard(${pageLabel})#redirectToAuth`,
          hasValidSession: !!probe && (probe.expires_at ?? 0) * 1000 > Date.now(),
          hasWaitingTableMembership: false,
          hasActiveRecoveryLease: !!lease,
          userId: probe?.user?.id ?? user?.id ?? null,
          dealerGameId: lease?.gameId ?? null,
          guardInputs: { reason, currentPath, pageLabel },
          note: "redirectToAuth probe",
        });
      }).catch(() => { /* noop */ });
      recordRouteRedirect({
        from: currentPath,
        to: "/auth",
        reason,
        caller: `useAuthGuard(${pageLabel})#redirectToAuth`,
        dealerGameId: getActiveRecoveryLease()?.gameId ?? null,
        playerId: user?.id ?? null,
      });
      traceAuthEvent("app-unexpected-navigation-login", {
        previousRoute: currentPath,
        nextRoute: "/auth",
        reason,
        authState: user ? "had-user" : "no-user",
      });
      sessionStorage.setItem("redirectAfterAuth", currentPath);
      navigate("/auth");
    }


    async function verifySessionOrRedirect(trigger: string) {
      // Double-check: maybe the token refreshed by now
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (freshSession) {
        // Transient loss – session recovered
        traceAuthEvent("app-auth-session-recovered", {
          trigger,
          userId: freshSession.user.id,
        });
        setUser(freshSession.user);
        setIsReady(true);
      } else {
        // Confirmed loss
        traceAuthEvent("app-auth-session-lost", {
          trigger,
          previousUserId: user?.id ?? null,
          tokenRefreshInProgress: false,
        });
        redirectToAuth(trigger);
      }
    }

    // ── initial session check ────────────────────────────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        traceAuthEvent("app-auth-session-lost", {
          trigger: "initial-getSession",
          previousUserId: null,
        });
        redirectToAuth("initial-no-session");
      } else {
        // ID-stable promotion: only replace the user object if the id
        // actually changed. Replacing on every getSession resolution
        // produces a fresh object reference even when the user is the
        // same, which invalidates any effect deps that include the
        // `user` object and re-runs heavy hydration paths.
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
          // Clear any pending recheck
          if (recheckTimerRef.current) {
            clearTimeout(recheckTimerRef.current);
            recheckTimerRef.current = null;
          }
          setUser((prev) => (prev && prev.id === session.user.id ? prev : session.user));
          setIsReady(true);
        } else {
          // ── CRITICAL CHANGE ────────────────────────────────
          // Do NOT immediately redirect.  Wait and re-verify.
          // This prevents kicking users on transient refresh gaps.
          if (event === "SIGNED_OUT") {
            // Explicit sign-out: redirect immediately
            redirectToAuth("explicit-SIGNED_OUT");
          } else {
            // Transient null (TOKEN_REFRESHED race, network blip, etc.)
            traceAuthEvent("app-auth-session-lost", {
              trigger: `transient-null-event-${event}`,
              previousUserId: user?.id ?? null,
              tokenRefreshInProgress: true,
            });

            // Schedule a recheck
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

  return { user, isReady };
}
