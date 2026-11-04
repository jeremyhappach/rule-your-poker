import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getActiveRecoveryLease } from '@/lib/sessionRecoveryLease';
import { isSplashLobbyEntry, launchSplash, SPLASH_FADE_MS, SPLASH_MAX_VISIBLE_MS,
  SPLASH_PLAYBACK_WATCHDOG_MS, SPLASH_POSTER, SPLASH_OPENING_FRAME, SPLASH_VIDEO } from '@/lib/launchSplash';
import './FreshLaunchSplash.css';

/** An optional sibling of the authenticated live lobby, never an initialization gate. */
export function FreshLaunchSplash({ userId, ready }: { userId: string; ready: boolean }) {
  const routeIsLobby = isSplashLobbyEntry(useLocation());
  const [phase, setPhase] = useState<'pending' | 'preparing' | 'showing' | 'fading' | 'done'>('pending');
  const [still, setStill] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [mediaDone, setMediaDone] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const claimed = useRef(false);
  const cancelled = useRef(false);
  const owner = useRef(userId);
  const dispose = useRef(() => {});
  const releaseCover = useCallback(() => window.dispatchEvent(new Event('ptown:launch-cover-ready')), []);
  const cancel = useCallback(() => { cancelled.current = true; setPhase('done'); releaseCover(); }, [releaseCover]);
  const finish = useCallback(() => { setStill(true); setMediaDone(true); setPhase(p=>p==='preparing'?'showing':p); }, []);
  const fade = useCallback(() => setPhase(p => p === 'showing' ? 'fading' : p), []);

  useLayoutEffect(() => {
    if (!routeIsLobby || owner.current !== userId) cancel();
  }, [routeIsLobby, userId, cancel]);

  useEffect(() => {
    if (cancelled.current || (!claimed.current && !launchSplash.claim())) { cancel(); return; }
    claimed.current = true;
    // Only the currently recovered table matters. Historical/open memberships
    // elsewhere in the account must not veto an ordinary lobby launch.
    if (getActiveRecoveryLease()) { cancel(); return; }
    let alive = true;
    const hidden = () => { if (document.hidden) cancel(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) cancel(); };
    const events = ['pagehide', 'popstate', 'app:page-resumed', 'pointerdown', 'keydown'];
    events.forEach(event => window.addEventListener(event, cancel));
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pageshow', restored);
    // Bounds an unavailable image, not app/auth/lobby initialization.
    const assetTimeout = setTimeout(cancel, SPLASH_MAX_VISIBLE_MS);
    const sources = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? [SPLASH_POSTER] : [SPLASH_OPENING_FRAME, SPLASH_POSTER];
    let remaining = sources.length;
    const posters = sources.map(src => {
      const poster = new Image();
      poster.onload = () => {
        void (poster.decode?.() ?? Promise.resolve()).then(() => {
          if (!alive || cancelled.current || --remaining > 0) return;
          clearTimeout(assetTimeout);
          if (document.hidden || getActiveRecoveryLease()) { cancel(); return; }
          setPhase(matchMedia('(prefers-reduced-motion: reduce)').matches?'showing':'preparing');
        }).catch(cancel);
      };
      poster.onerror = cancel;
      poster.src = src;
      return poster;
    });
    const cleanup = () => {
      alive = false;
      clearTimeout(assetTimeout);
      posters.forEach(poster => { poster.onload = poster.onerror = null; });
      events.forEach(event => window.removeEventListener(event, cancel));
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pageshow', restored);
    };
    dispose.current = cleanup;
    return cleanup;
  }, [cancel]);

  useEffect(() => { if (phase === 'done') dispose.current(); }, [phase]);

  useLayoutEffect(() => {
    if (phase === 'preparing' || phase === 'showing') releaseCover();
  }, [phase, releaseCover]);

  useEffect(() => {
    if (phase !== 'preparing') return;
    const node=video.current;
    if (!node?.canPlayType('video/mp4')) { finish(); return; }
    if (node.readyState >= 2) { setPhase('showing'); return; }
    // Asset failure bound, never a guessed playback/start delay.
    const timeout=setTimeout(finish,SPLASH_MAX_VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== 'showing') return;
    // Play concurrently with loading. Ended releases the ready lobby; the
    // watchdog handles a stalled video, and the hard bound handles failed init.
    const playback = setTimeout(finish, SPLASH_PLAYBACK_WATCHDOG_MS);
    const hardLimit = setTimeout(fade, SPLASH_MAX_VISIBLE_MS);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => { if (reduced.matches) finish(); };
    reduced.addEventListener('change', preference);
    return () => {
      clearTimeout(playback);
      clearTimeout(hardLimit);
      reduced.removeEventListener('change', preference);
    };
  }, [phase, finish, fade]);

  useEffect(() => {
    if (phase === 'showing' && mediaDone && ready) fade();
  }, [phase, mediaDone, ready, fade]);

  useEffect(() => {
    if (phase !== 'showing') return;
    if (still) { finish(); return; }
    const node = video.current;
    if (!node) return;
    let alive = true;
    let frame: number | undefined, paint: number | undefined;
    const reveal = () => { if (alive) setFrameReady(true); };
    const decoded = () => {
      if (node.readyState < 2) return;
      paint=requestAnimationFrame(()=>{paint=requestAnimationFrame(reveal);});
    };
    if (node.requestVideoFrameCallback) frame=node.requestVideoFrameCallback(reveal);
    else node.addEventListener('playing',decoded);
    const fallback = () => { if (alive) finish(); };
    node.muted = true;
    node.defaultMuted = true;
    if (!node.canPlayType('video/mp4')) { fallback(); return; }
    try { void node.play()?.catch(fallback); } catch { fallback(); }
    return () => {
      alive = false;
      if (frame !== undefined) node.cancelVideoFrameCallback(frame);
      if (paint !== undefined) cancelAnimationFrame(paint);
      node.removeEventListener('playing',decoded);
      node.pause(); node.removeAttribute('src'); node.load();
    };
  }, [phase, still, finish]);

  useEffect(() => {
    if (phase !== 'fading') return;
    const timer = setTimeout(cancel, SPLASH_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase, cancel]);

  if (!routeIsLobby || owner.current !== userId || !['preparing','showing','fading'].includes(phase)) return null;
  return <div className="fresh-launch-splash" data-launch-splash={phase} data-frame-ready={frameReady&&!still} aria-hidden="true"
    style={{ opacity: phase === 'fading' ? 0 : 1 }}>
    <img src={still ? SPLASH_POSTER : SPLASH_OPENING_FRAME} alt="" className="fresh-launch-splash-art" />
    {!still && <video ref={video} src={SPLASH_VIDEO} poster={SPLASH_OPENING_FRAME}
      className="fresh-launch-splash-art" muted playsInline preload="auto"
      onLoadedData={()=>setPhase(p=>p==='preparing'?'showing':p)}
      disablePictureInPicture tabIndex={-1} onEnded={finish} onError={finish} />}
  </div>;
}
