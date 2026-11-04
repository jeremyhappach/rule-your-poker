/** Presentation admission only. Never routes, refreshes auth, or resumes a game. */
export const SPLASH_FADE_MS = 200;
export const SPLASH_PLAYBACK_WATCHDOG_MS = 3500;
export const SPLASH_MAX_VISIBLE_MS = 5000;
export const SPLASH_POSTER = '/launch-splash/approved-v1.png';
// Exact first frame of the approved MP4; the supplied PNG is its completed artwork.
export const SPLASH_OPENING_FRAME = '/launch-splash/approved-v1-opening.png';
export const SPLASH_VIDEO = '/launch-splash/approved-v1.mp4';

export interface LaunchEvidence {
  standalone: boolean;
  pathname: string;
  search: string;
  hash: string;
  navigationType?: string;
  discarded: boolean;
  visible: boolean;
}

export function isSplashLobbyEntry(e: Pick<LaunchEvidence, 'pathname' | 'search' | 'hash'>): boolean {
  // Installed iOS icons may retain the original "/" start URL.
  return e.pathname === '/' && (e.search === '' || e.search === '?launch=home') && !e.hash;
}

export function eligibleLaunch(e: LaunchEvidence): boolean {
  return e.standalone && isSplashLobbyEntry(e) && e.navigationType === 'navigate'
    && !e.discarded && e.visible;
}

function captureLaunch() {
  let eligible = false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    eligible = eligibleLaunch({
      standalone: matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      pathname: location.pathname, search: location.search, hash: location.hash,
      navigationType: nav?.type, visible: !document.hidden,
      discarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true,
    });
    if (location.pathname === '/' && location.search === '?launch=home' && !location.hash) {
      history.replaceState(history.state, '', '/');
    }
  } catch { eligible = false; }
  return eligible;
}

let stopWatching = () => {};
// In-memory, per-document receipt. sessionStorage survives some iOS relaunches
// and is not evidence of a currently running app or active session recovery.
export const launchSplash = {
  eligible: typeof window !== 'undefined' && captureLaunch(),
  consumed: false,
  claim() {
    if (!this.eligible || this.consumed) return false;
    this.consumed = true;
    stopWatching();
    return true;
  },
};

// Cancel a pending launch if the app resumes/navigates before auth mounts Index.
// Loading duration is deliberately absent from launch eligibility.
if (typeof window !== 'undefined' && launchSplash.eligible) {
  const cancel = () => { launchSplash.eligible = false; stopWatching(); window.dispatchEvent(new Event('ptown:launch-cover-ready')); };
  const visibility = () => { if (document.hidden) cancel(); };
  const restored = (event: PageTransitionEvent) => { if (event.persisted) cancel(); };
  const events = ['pagehide', 'popstate', 'app:page-resumed', 'pointerdown', 'keydown'];
  stopWatching = () => {
    events.forEach(event => window.removeEventListener(event, cancel));
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pageshow', restored);
  };
  events.forEach(event => window.addEventListener(event, cancel));
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pageshow', restored);
  const poster = new Image();
  poster.src = SPLASH_POSTER;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const opening = new Image();
    opening.src = SPLASH_OPENING_FRAME;
  }
}
