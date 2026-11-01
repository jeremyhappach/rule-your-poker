import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { launchSplash, SPLASH_END_MS, SPLASH_FADE_MS, SPLASH_POSTER, SPLASH_VIDEO } from '@/lib/launchSplash';
import './FreshLaunchSplash.css';

/** An optional sibling of the live lobby, never an initialization gate. */
export function FreshLaunchSplash({ userId, ready }: { userId: string; ready: boolean }) {
  const route = useLocation();
  const [clearForUser, setClearForUser] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pending' | 'showing' | 'fading' | 'done'>('pending');
  const [posterReady, setPosterReady] = useState(false);
  const [still, setStill] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const video = useRef<HTMLVideoElement>(null);
  const eligible = useRef(launchSplash.eligible && !launchSplash.consumed);
  const routeIsLobby = route.pathname === '/' && !route.search && !route.hash;
  const finish = () => setPhase(p => p === 'showing' ? 'fading' : p);

  useEffect(() => {
    if (!eligible.current || !launchSplash.eligible) return;
    let alive = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => { abort.abort(); setPhase('done'); }, Math.max(0, SPLASH_END_MS - performance.now()));
    const poster = new Image();
    poster.onload = () => { if (alive) setPosterReady(true); };
    poster.onerror = () => { if (alive) setPhase('done'); };
    poster.src = SPLASH_POSTER;
    // Unlike the newest-50 lobby list, this checks ALL of this user's seats.
    // Errors/unknown state fail closed for splash admission, never for the app.
    void Promise.resolve(supabase.from('players').select('id,games!inner(status)')
      .eq('user_id', userId).neq('games.status', 'session_ended').limit(1).abortSignal(abort.signal))
      .then(({ data, error }) => {
        if (!alive) return;
        clearTimeout(timeout);
        if (!error && data?.length === 0) setClearForUser(userId);
        else setPhase('done');
      }).catch(() => { if (alive) { clearTimeout(timeout); setPhase('done'); } });
    return () => { alive = false; abort.abort(); clearTimeout(timeout); poster.onload = poster.onerror = null; };
  }, [userId]);

  useLayoutEffect(() => {
    if (phase !== 'pending' || !ready || !posterReady || clearForUser !== userId) return;
    if (!eligible.current || !launchSplash.eligible || launchSplash.consumed || !routeIsLobby
      || performance.now() >= SPLASH_END_MS - 1000 || document.hidden) {
      setPhase('done'); return;
    }
    launchSplash.consumed = true;
    setPhase('showing');
  }, [phase, ready, posterReady, clearForUser, userId, routeIsLobby]);

  useEffect(() => {
    if (phase !== 'showing') return;
    // The navigation budget includes JS/auth/lobby startup time.
    // A late or stalled video cannot add a second three-second wait.
    const timer = setTimeout(finish, Math.max(0, SPLASH_END_MS - performance.now()));
    const cancel = () => setPhase('done');
    const hidden = () => { if (document.hidden) cancel(); };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => { if (reduced.matches) { setStill(true); finish(); } };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', cancel);
    window.addEventListener('app:page-resumed', cancel);
    window.addEventListener('pointerdown', cancel);
    window.addEventListener('keydown', cancel);
    reduced.addEventListener('change', preference);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('app:page-resumed', cancel);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', cancel);
      reduced.removeEventListener('change', preference);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'showing') return;
    if (still) { finish(); return; }
    const node = video.current;
    if (!node) return;
    let alive = true;
    const fallback = () => { if (alive) { setStill(true); finish(); } };
    node.muted = true;
    node.defaultMuted = true;
    if (!node.canPlayType('video/mp4')) { fallback(); return; }
    try { void node.play()?.catch(fallback); } catch { fallback(); }
    return () => { alive = false; node.pause(); node.removeAttribute('src'); node.load(); };
  }, [phase, still]);

  useEffect(() => {
    if (phase !== 'fading') return;
    const timer = setTimeout(() => setPhase('done'), SPLASH_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (!routeIsLobby || clearForUser !== userId || !ready || (phase !== 'showing' && phase !== 'fading')) return null;
  return <div className="fresh-launch-splash" data-launch-splash={phase} aria-hidden="true"
    style={{ opacity: phase === 'fading' ? 0 : 1 }}>
    <img src={SPLASH_POSTER} alt="" className="fresh-launch-splash-art" />
    {!still && <video ref={video} src={SPLASH_VIDEO} poster={SPLASH_POSTER}
      className="fresh-launch-splash-art" autoPlay muted playsInline preload="auto"
      disablePictureInPicture tabIndex={-1}
      onLoadedMetadata={event => {
        try { event.currentTarget.currentTime = Math.min(2, performance.now() / 1000); }
        catch { setStill(true); finish(); }
      }}
      onEnded={finish} onError={() => { setStill(true); finish(); }} />}
  </div>;
}
