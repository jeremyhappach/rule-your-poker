export type TrackAudioNode = <T extends AudioNode>(node: T) => T;
export interface AudioCue {
  durationMs: number;
  schedule: (context: AudioContext, destination: AudioNode, track: TrackAudioNode) => boolean;
}

interface AudioEvent {
  userId: string;
  /** Full authoritative event identity, scoped by cue and user. */
  id: string;
  expiresAt: number;
  cue: AudioCue;
}

export interface AudioTimeline {
  userId: string;
  id: string;
  startedAt: number;
  expiresAt: number;
  cueAt: (elapsedMs: number, remainingMs: number) => AudioCue;
}
interface TimelineOwner {
  event: AudioTimeline;
  owners: Set<object>;
  timer: ReturnType<typeof setTimeout>;
  stop?: () => void;
}

interface AudioEnvironment {
  createContext: () => AudioContext;
  loadPreference: (userId: string) => Promise<boolean | null>;
  now: () => number;
  storage: () => Storage;
  document: () => Document;
}

/** One application owner. Games supply cues and presentation deadlines, never contexts. */
export class AudioManager {
  private context: AudioContext | null = null;
  private userId: string | null = null;
  private enabled: boolean | null = null;
  private preferenceVersion = 0;
  private played = new Set<string>();
  private pending = new Map<string, { event: AudioEvent; owners: Set<object>; timer: ReturnType<typeof setTimeout> }>();
  private active = new Set<() => void>();
  private timelines = new Map<string, TimelineOwner>();
  private uninstall: (() => void) | null = null;

  constructor(private env: AudioEnvironment) {}

  install() {
    if (this.uninstall) return this.uninstall;
    const doc = this.env.document();
    // Touch/pointer release matters on Safari; capture runs before route-changing handlers.
    const gestures = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'];
    const gesture = (event: Event) => { if (event.isTrusted) this.unlock(); };
    const visibility = () => {
      if (doc.hidden) this.stopActive();
      else this.unlock();
    };
    gestures.forEach(name => doc.addEventListener(name, gesture, { capture: true, passive: true }));
    doc.addEventListener('visibilitychange', visibility);
    this.uninstall = () => {
      gestures.forEach(name => doc.removeEventListener(name, gesture, true));
      doc.removeEventListener('visibilitychange', visibility);
      this.stopActive();
      this.clearPending();
      this.preferenceVersion++;
      if (this.context) {
        this.context.removeEventListener('statechange', this.stateChanged);
        void this.context.close().catch(() => {});
        this.context = null;
      }
      this.uninstall = null;
    };
    return this.uninstall;
  }

  setUser(userId: string | null) {
    if (this.userId === userId) return;
    this.stopActive();
    this.clearPending();
    this.userId = userId;
    this.enabled = null; // Unknown preferences must never briefly unmute a user.
    const version = ++this.preferenceVersion;
    if (!userId) return;
    // Defer profile I/O outside the synchronous auth notification callback.
    void Promise.resolve().then(() => this.env.loadPreference(userId)).then(enabled => {
      if (this.preferenceVersion !== version) return;
      this.enabled = enabled;
      this.flush();
    }).catch(() => {});
  }

  setPreference(userId: string, enabled: boolean) {
    if (userId !== this.userId) return;
    this.preferenceVersion++; // A late initial fetch cannot overwrite a successful preference save.
    this.enabled = enabled;
    if (!enabled) this.stopActive();
    this.flush();
  }

  /** Call synchronously in a trusted gesture: do not await preference or auth I/O first. */
  unlock = () => {
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.env.createContext();
        this.context.addEventListener('statechange', this.stateChanged);
      }
      if (this.context.state !== 'running') {
        this.stopActive(); // Never resume old sources after a suspended/interrupted audio clock.
        void this.context.resume().then(() => this.flush()).catch(() => {});
      }
      this.flush();
    } catch { /* Unsupported/blocked audio never blocks gameplay. */ }
  };

  /** Existing instantaneous platform sounds retain their call sites; never catch them up. */
  play(cue: AudioCue) {
    this.unlock();
    return this.schedule(cue, this.env.now() + cue.durationMs + 50);
  }

  request(event: AudioEvent) {
    const key = `ptown-audio:${event.userId}:${event.id}`;
    if (event.userId !== this.userId || this.hasPlayed(key) || event.expiresAt <= this.env.now()) return () => {};
    const token = {};
    let entry = this.pending.get(key);
    if (!entry) {
      entry = { event, owners: new Set(), timer: setTimeout(() => this.removePending(key), event.expiresAt - this.env.now()) };
      this.pending.set(key, entry);
    }
    entry.owners.add(token);
    this.unlock();
    // Withdrawing a component removes only unscheduled work. A scheduled cue survives remounts.
    return () => {
      entry.owners.delete(token);
      if (!entry.owners.size && this.pending.get(key) === entry) this.removePending(key);
    };
  }

  /** Cancellable presentation audio. Unlock skips elapsed ticks; interruption retires the event. */
  follow(event: AudioTimeline) {
    const key = `ptown-audio:${event.userId}:${event.id}`;
    if (event.userId !== this.userId || event.expiresAt <= this.env.now() || this.env.document().hidden) return () => {};
    let entry = this.timelines.get(key);
    if (!entry) {
      if (this.hasPlayed(key)) return () => {};
      this.unlock();
      entry = {event, owners: new Set(), timer: setTimeout(() => this.retireTimeline(key), event.expiresAt - this.env.now())};
      this.timelines.set(key, entry);
    }
    const owner = {};
    entry.owners.add(owner);
    this.flush();
    return () => {
      entry.owners.delete(owner);
      // React's effect rehearsal may reacquire the same event in this microtask.
      queueMicrotask(() => { if (!entry.owners.size && this.timelines.get(key) === entry) this.retireTimeline(key); });
    };
  }

  private remember(key: string) {
    this.played.add(key);
    try { this.env.storage().setItem(key, '1'); } catch { /* In-memory receipt remains. */ }
  }
  private retireTimeline(key: string) {
    const entry = this.timelines.get(key);
    if (!entry) return;
    this.timelines.delete(key);
    clearTimeout(entry.timer);
    entry.stop?.();
    this.remember(key);
  }

  private stateChanged = () => {
    if (this.context?.state !== 'running') this.stopActive();
    else this.flush();
  };

  private flush() {
    for (const [key, entry] of this.timelines) {
      const remaining = entry.event.expiresAt - this.env.now();
      if (remaining <= 0) { this.retireTimeline(key); continue; }
      if (entry.stop || !entry.owners.size || this.env.now() < entry.event.startedAt) continue;
      const cue = entry.event.cueAt(this.env.now() - entry.event.startedAt, remaining);
      this.schedule(cue, entry.event.expiresAt, stop => { entry.stop = stop; this.remember(key); });
    }
    for (const [key, { event }] of this.pending) {
      if (event.expiresAt - this.env.now() < event.cue.durationMs) {
        this.removePending(key);
      } else if (this.schedule(event.cue, event.expiresAt)) {
        // Success means every source was scheduled in a running context, not merely attempted.
        this.played.add(key);
        try { this.env.storage().setItem(key, '1'); } catch { /* In-memory dedupe remains. */ }
        this.removePending(key);
      }
    }
  }

  private schedule(cue: AudioCue, expiresAt: number, scheduled?: (stop: () => void) => void) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.enabled !== true || this.env.document().hidden) return false;
    if (expiresAt - this.env.now() < cue.durationMs) return false;
    const nodes: AudioNode[] = [];
    const track: TrackAudioNode = node => { nodes.push(node); return node; };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      for (const node of nodes) {
        if ('stop' in node) { try { (node as AudioScheduledSourceNode).stop(); } catch { /* Already ended. */ } }
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
      this.active.delete(stop);
    };
    try {
      // Connect only after the complete cue schedules, so a partial failure stays silent.
      const output = track(ctx.createGain());
      if (!cue.schedule(ctx, output, track) || ctx.state !== 'running' || this.env.now() >= expiresAt) {
        stop();
        return false;
      }
      output.connect(ctx.destination);
      this.active.add(stop);
      timer = setTimeout(stop, Math.min(cue.durationMs, expiresAt - this.env.now()));
      scheduled?.(stop);
      return true;
    } catch {
      stop();
      return false;
    }
  }

  private hasPlayed(key: string) {
    if (this.played.has(key)) return true;
    try { return this.env.storage().getItem(key) === '1'; } catch { return false; }
  }
  private stopActive() {
    for (const key of this.timelines.keys()) this.retireTimeline(key);
    for (const stop of this.active) stop();
  }
  private removePending(key: string) {
    clearTimeout(this.pending.get(key)?.timer);
    this.pending.delete(key);
  }
  private clearPending() { for (const key of this.pending.keys()) this.removePending(key); }
}
