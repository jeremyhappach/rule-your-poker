/** Presentation admission only. Never routes, refreshes auth, or resumes a game. */
export const SPLASH_END_MS = 3000;
export const SPLASH_FADE_MS = 200;
export const SPLASH_POSTER = '/launch-splash/approved-v1.png';
export const SPLASH_VIDEO = '/launch-splash/approved-v1.mp4';
const SEEN_KEY = 'ptown:launch-document:v1';

export interface LaunchEvidence {
  standalone: boolean;
  pathname: string;
  search: string;
  hash: string;
  navigationType?: string;
  restored: boolean;
  visible: boolean;
  elapsed: number;
}

export function eligibleLaunch(e: LaunchEvidence): boolean {
  return e.standalone && e.pathname === '/' && e.search === '?launch=home'
    && !e.hash && e.navigationType === 'navigate' && !e.restored && e.visible
    && e.elapsed < SPLASH_END_MS - 1000;
}

// Capture once, before routing/auth can replace the entry URL. A retained
// browsing session is deliberately ambiguous: skip rather than cover recovery.
function captureLaunch() {
  let eligible = false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const restored = sessionStorage.getItem(SEEN_KEY) !== null
      || (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true;
    sessionStorage.setItem(SEEN_KEY, '1');
    eligible = eligibleLaunch({
      standalone: matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      pathname: location.pathname, search: location.search, hash: location.hash,
      navigationType: nav?.type, restored, visible: !document.hidden, elapsed: performance.now(),
    });
    // Consume only our exact Home Screen marker. Preserve every deep link.
    if (location.pathname === '/' && location.search === '?launch=home' && !location.hash) {
      history.replaceState(history.state, '', '/');
    }
  } catch { eligible = false; /* Missing launch evidence/storage: no branding delay. */ }
  return eligible;
}

export const launchSplash = {
  eligible: typeof window !== 'undefined' && captureLaunch(),
  consumed: false,
};

// Cancel even while authentication is unresolved; never start after a resume
// or after the user has already begun interacting with the actual lobby.
if (typeof window !== 'undefined' && launchSplash.eligible) {
  const cancel = () => { launchSplash.eligible = false; cleanup(); };
  const visibility = () => { if (document.hidden) cancel(); };
  const events = ['pagehide', 'popstate', 'app:page-resumed', 'pointerdown', 'keydown'];
  const cleanup = () => {
    events.forEach(event => window.removeEventListener(event, cancel));
    document.removeEventListener('visibilitychange', visibility);
    clearTimeout(deadline);
  };
  events.forEach(event => window.addEventListener(event, cancel, { once: true }));
  document.addEventListener('visibilitychange', visibility);
  const deadline = setTimeout(cancel, Math.max(0, SPLASH_END_MS - performance.now()));
  const poster = new Image();
  poster.src = SPLASH_POSTER;
}
