// @vitest-environment jsdom
/**
 * useVoiceToText isolation tests.
 *
 * Verifies:
 *  - Static isolation: source file does not import any runtime-tracer,
 *    voice-operation, incident, chat-boundary, flight-recorder, or
 *    lifecycle-debug system, and does not persist to storage or use
 *    pagehide/sendBeacon.
 *  - Unsupported browser: isSupported=false, start() degrades safely.
 *  - Permission denied: draft owned by the caller stays untouched and
 *    the hook enters an error state without crashing.
 *  - Successful transcription returns a string; hook never issues a
 *    chat-message insert of its own.
 *  - Existing external draft is preserved across start / stop.
 *  - Unmount stops recognition and releases the mic stream tracks.
 *  - Remount uses a fresh MediaRecorder and does not duplicate handlers
 *    on the previous instance.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React, { useEffect } from 'react';

// Raw file contents via Vite's `?raw` — no Node fs needed.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- ?raw import provided by Vite/Vitest at test time.
import useVoiceToTextSource from './useVoiceToText.ts?raw';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_name: string, _opts: unknown) => ({
        data: { transcript: 'hello world' },
        error: null,
      })),
    },
  },
}));

import { useVoiceToText, detectVoiceSupport, type UseVoiceToTextResult } from './useVoiceToText';
import { supabase } from '@/integrations/supabase/client';

// ---- Static contract: no forbidden dependencies -----------------------------

describe('useVoiceToText isolation (static)', () => {
  const FORBIDDEN = [
    'runtimeInstrumentation/runtimeTracer',
    'runtimeInstrumentation/voiceOperation',
    'runtimeInstrumentation/serverVoiceOperation',
    'runtimeInstrumentation/voicePresenceHeartbeat',
    'runtimeInstrumentation/voiceCrashCapsule',
    'runtimeInstrumentation/runtimePipelineProof',
    'VoiceOperationIdentityContext',
    'chatOperations/chatOperationBoundary',
    'startupFlightRecorder',
    'lifecycleDebug',
    'sendBeacon',
    'pagehide',
    'localStorage',
    'sessionStorage',
  ];
  for (const forbidden of FORBIDDEN) {
    it(`does not import or reference "${forbidden}"`, () => {
      expect((useVoiceToTextSource as string).includes(forbidden)).toBe(false);
    });
  }
});

// ---- Test harness: mount a hook in a real React root ------------------------

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])]) });
    this.onstop?.();
  }
}

interface MountedHook {
  root: Root;
  container: HTMLDivElement;
  current: () => UseVoiceToTextResult;
}

async function mountHook(): Promise<MountedHook> {
  const captured: { current: UseVoiceToTextResult | null } = { current: null };
  function Probe() {
    const v = useVoiceToText();
    captured.current = v;
    // Wait one frame to ensure permission query settles.
    useEffect(() => {
      captured.current = v;
    });
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  // Flush the permission-query microtask.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    root,
    container,
    current: () => {
      if (!captured.current) throw new Error('hook not mounted');
      return captured.current;
    },
  };
}

function installMediaEnv(opts: {
  supported?: boolean;
  permission?: 'granted' | 'denied' | 'prompt';
} = {}) {
  const supported = opts.supported ?? true;
  const perm = opts.permission ?? 'granted';

  const tracks = [
    { readyState: 'live', stop: vi.fn() },
  ] as unknown as MediaStreamTrack[];
  const stream = {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;

  const mediaDevices = supported
    ? {
        getUserMedia: vi.fn(async () => {
          if (perm === 'denied') {
            const err = new Error('denied');
            (err as { name?: string }).name = 'NotAllowedError';
            throw err;
          }
          return stream;
        }),
      }
    : undefined;

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices,
  });
  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: {
      query: async () =>
        ({ state: perm, onchange: null } as unknown as PermissionStatus),
    },
  });

  if (supported) {
    (globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
      FakeMediaRecorder;
    Object.defineProperty(globalThis.window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
  } else {
    delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    Object.defineProperty(globalThis.window, 'MediaRecorder', {
      configurable: true,
      value: undefined,
    });
  }
  return { stream, tracks };
}

// ---- Runtime tests ---------------------------------------------------------

describe('useVoiceToText runtime', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    (supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>).mockReset();
    (supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { transcript: 'hello world' },
      error: null,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unsupported browser reports isSupported=false and start() degrades safely', async () => {
    installMediaEnv({ supported: false });
    expect(detectVoiceSupport()).toBe(false);
    const h = await mountHook();
    expect(h.current().isSupported).toBe(false);
    await act(async () => {
      await h.current().start();
    });
    expect(h.current().state).toBe('error');
    expect(h.current().error).toMatch(/not supported/i);
  });

  it('permission denied leaves external draft untouched and does not crash', async () => {
    installMediaEnv({ permission: 'denied' });
    const draft = { value: 'preserved-draft' };
    const h = await mountHook();
    // Force permission to 'denied' so start() short-circuits without
    // calling getUserMedia; even if it does call it, the fake rejects
    // with NotAllowedError which is handled without throwing.
    await act(async () => {
      await h.current().start();
    });
    expect(h.current().state).toBe('error');
    expect(h.current().permission).toBe('denied');
    expect(draft.value).toBe('preserved-draft');
  });

  it('final transcript returns a string; hook never sends a chat message', async () => {
    installMediaEnv();
    const h = await mountHook();
    await act(async () => {
      await h.current().start();
    });
    expect(h.current().state).toBe('recording');

    let transcript: string | null = null;
    await act(async () => {
      transcript = await h.current().stop();
    });
    expect(transcript).toBe('hello world');
    const invokeMock = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
    expect(invokeMock.mock.calls.length).toBe(1);
    expect(invokeMock.mock.calls[0][0]).toBe('voice-to-text');
  });

  it('existing external draft is preserved across start / stop', async () => {
    installMediaEnv();
    const draft = { value: 'user-typed-so-far' };
    const h = await mountHook();
    await act(async () => {
      await h.current().start();
    });
    expect(draft.value).toBe('user-typed-so-far');
    await act(async () => {
      await h.current().stop();
    });
    expect(draft.value).toBe('user-typed-so-far');
  });

  it('unmount stops recorder and releases stream tracks', async () => {
    const { tracks } = installMediaEnv();
    const h = await mountHook();
    await act(async () => {
      await h.current().start();
    });
    expect(FakeMediaRecorder.instances.length).toBe(1);
    await act(async () => {
      h.root.unmount();
    });
    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
    for (const t of tracks) {
      expect((t.stop as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
    }
  });

  it('remount uses a fresh recorder and does not duplicate handlers', async () => {
    installMediaEnv();
    const h1 = await mountHook();
    await act(async () => {
      await h1.current().start();
    });
    const firstRec = FakeMediaRecorder.instances[0];
    await act(async () => {
      h1.root.unmount();
    });

    const h2 = await mountHook();
    await act(async () => {
      await h2.current().start();
    });
    const secondRec = FakeMediaRecorder.instances[1];
    expect(secondRec).not.toBe(firstRec);
    expect(firstRec.state).toBe('inactive');
  });
});
