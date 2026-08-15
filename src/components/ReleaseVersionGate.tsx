import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BUILD_IDENTITY } from "@/lib/buildIdentity";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublishedBuildManifest } from "@/lib/releaseVersion/releaseManifest";
import {
  isBuildCurrent,
  getGameEntryReleaseDecision,
  parseReleasePublication,
  RELEASE_PUBLICATION_SETTING_KEY,
  shouldShowLobbyReleaseModal,
  type ReleaseCheckStatus,
} from "@/lib/releaseVersion/releasePublication";

interface ReleaseVersionContextValue {
  status: ReleaseCheckStatus;
  publishedBuildSha: string | null;
}

const initialReleaseVersionContext: ReleaseVersionContextValue = {
  status: import.meta.env.PROD ? "checking" : "current",
  publishedBuildSha: null,
};

const ReleaseVersionContext = createContext<ReleaseVersionContextValue>(initialReleaseVersionContext);

function useReleaseVersionContext(): ReleaseVersionContextValue {
  return useContext(ReleaseVersionContext);
}

function isGameRoute(pathname: string): boolean {
  return /^\/game\/[^/]+/.test(pathname);
}

function ReloadBuildDialog({ unavailable = false }: { unavailable?: boolean }) {
  const handleRefresh = () => window.location.reload();
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {unavailable ? "Checking current build" : "Not on current build"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {unavailable
              ? "We could not verify the current app version. Refresh before starting a game."
              : "A newer version of P-Town Poker has been published. Refresh before starting a game."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleRefresh}>Refresh</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReleaseCheckScreen({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      {unavailable ? <ReloadBuildDialog unavailable /> : <p role="status">Checking current build…</p>}
    </div>
  );
}

/**
 * A game route is admitted exactly once after a fresh release check. Later
 * publications cannot unmount a live table; they are deferred until the user
 * returns to a non-game route.
 */
export function ReleaseProtectedGameRoute({ children }: { children: ReactNode }) {
  const { status } = useReleaseVersionContext();
  const { gameId } = useParams();

  return (
    <GameRouteEntryCheck key={gameId ?? "unknown-game"} ambientStatus={status}>
      {children}
    </GameRouteEntryCheck>
  );
}

function GameRouteEntryCheck({
  ambientStatus,
  children,
}: {
  ambientStatus: ReleaseCheckStatus;
  children: ReactNode;
}) {
  const admittedRef = useRef(false);
  const [entryStatus, setEntryStatus] = useState<ReleaseCheckStatus>(
    import.meta.env.PROD ? "checking" : "current",
  );

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let cancelled = false;
    void fetchPublishedBuildManifest()
      .then((manifest) => {
        if (!cancelled) {
          setEntryStatus(isBuildCurrent(BUILD_IDENTITY.buildSha, manifest.buildId) ? "current" : "stale");
        }
      })
      .catch(() => {
        if (!cancelled) setEntryStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const decision = getGameEntryReleaseDecision(entryStatus, ambientStatus, admittedRef.current);

  if (decision === "checking") return <ReleaseCheckScreen />;
  if (decision === "unavailable") return <ReleaseCheckScreen unavailable />;
  if (decision === "refresh-required") return <ReloadBuildDialog />;

  admittedRef.current = true;
  return <>{children}</>;
}

export function ReleaseVersionGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<ReleaseCheckStatus>(initialReleaseVersionContext.status);
  const [publishedBuildSha, setPublishedBuildSha] = useState<string | null>(null);
  const manifestRequestInFlight = useRef(false);

  const reconcileManifest = useCallback(async () => {
    if (manifestRequestInFlight.current) return;
    manifestRequestInFlight.current = true;
    setStatus((current) => (current === "stale" ? current : "checking"));
    try {
      const manifest = await fetchPublishedBuildManifest();
      setPublishedBuildSha(manifest.buildId);
      setStatus(isBuildCurrent(BUILD_IDENTITY.buildSha, manifest.buildId) ? "current" : "stale");
    } catch {
      setStatus((current) => (current === "stale" ? current : "unavailable"));
    } finally {
      manifestRequestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    void reconcileManifest();

    const channel = supabase
      .channel("release_publication")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "system_settings",
          filter: `key=eq.${RELEASE_PUBLICATION_SETTING_KEY}`,
        },
        (payload) => {
          const release = parseReleasePublication((payload.new as { value?: unknown } | null)?.value);
          // The public manifest is the final authority. A verified release
          // event is a prompt to immediately re-check it, never an excuse to
          // trust a possibly delayed database notification by itself.
          if (release) void reconcileManifest();
        },
      )
      .subscribe();

    const onResume = () => void reconcileManifest();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void reconcileManifest();
    };
    window.addEventListener("app:page-resumed", onResume);
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("app:page-resumed", onResume);
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [reconcileManifest]);

  const value = useMemo(
    () => ({ status, publishedBuildSha }),
    [publishedBuildSha, status],
  );
  const showModal = shouldShowLobbyReleaseModal(status, isGameRoute(location.pathname));

  return (
    <ReleaseVersionContext.Provider value={value}>
      {children}
      {showModal && <ReloadBuildDialog unavailable={status === "unavailable"} />}
    </ReleaseVersionContext.Provider>
  );
}
