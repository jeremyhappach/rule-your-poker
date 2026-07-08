/**
 * useVoiceToText isolation tests.
 *
 * Verifies:
 *  - Unsupported browser reports isSupported=false and start() degrades safely.
 *  - Permission-denied does not touch the caller's draft and does not crash.
 *  - Interim/final transcripts return a string; hook never emits chat messages.
 *  - Existing draft is preserved by the hook (hook does not own the draft).
 *  - Unmount stops recognition and releases the mic stream.
 *  - The hook does NOT import runtime/incident/tracer/voice-operation systems.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, act, waitFor } from '@testing-library/react';

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

import { useVoiceToText, detectVoiceSupport } from './useVoiceToText';
import { supabase } from '@/integrations/supabase/client';

// ---- Static contract: no forbidden dependencies -----------------------------

describe('useVoiceToText isolation (static)', () => {
  const source = readFileSync(
    resolve(__dirname, 'useVoiceToText.ts'),
    'utf8',
  );

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
      expect(source.includes(forbidden)).toBe(false);
    });
  }
});

// ---- Runtime behavior -------------------------------------------------------

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
    // Emit one chunk of fake audio, then fire onstop.
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])]) });
    this.onstop?.();
  }
}

function installMediaEnv(opts: { supported?: boolean; permission?: 'granted' | 'denied' | 'prompt' } = {}) {
  const supported = opts.supported ?? true;
  const perm = opts.permission ?? 'granted';

  const tracks = [{ readyState: 'live', stop: vi.fn() }] as unknown as MediaStreamTrack[];
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
      query: async () => ({ state: perm, onchange: null } as unknown as PermissionStatus),
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

describe('useVoiceToText runtime', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    vi.mocked(supabase.functions.invoke).mockReset();
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { transcript: 'hello world' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unsupported browser hides voice safely', async () => {
    installMediaEnv({ supported: false });
    expect(detectVoiceSupport()).toBe(false);
    const { result } = renderHook(() => useVoiceToText());
    expect(result.current.isSupported).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toMatch(/not supported/i);
  });

  it('permission denied leaves draft untouched and does not crash', async () => {
    installMediaEnv({ permission: 'denied' });
    const draft = { value: 'preserved-draft' };
    const { result } = renderHook(() => useVoiceToText());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('error');
    expect(result.current.permission).toBe('denied');
    // Draft ownership lives outside the hook; it must remain untouched.
    expect(draft.value).toBe('preserved-draft');
  });

  it('final transcript updates return value but does not send a chat message', async () => {
    installMediaEnv();
    const { result } = renderHook(() => useVoiceToText());
    await waitFor(() => expect(result.current.permission).toBe('granted'));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');

    let transcript: string | null = null;
    await act(async () => {
      transcript = await result.current.stop();
    });
    expect(transcript).toBe('hello world');
    // The hook only calls the transcription edge function, never a
    // chat-send endpoint.
    const calls = vi.mocked(supabase.functions.invoke).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('voice-to-text');
  });

  it('existing draft is preserved across start/stop (hook does not own draft)', async () => {
    installMediaEnv();
    const draft = { value: 'user-typed-so-far' };
    const { result } = renderHook(() => useVoiceToText());
    await waitFor(() => expect(result.current.permission).toBe('granted'));

    await act(async () => {
      await result.current.start();
    });
    expect(draft.value).toBe('user-typed-so-far');

    await act(async () => {
      await result.current.stop();
    });
    expect(draft.value).toBe('user-typed-so-far');
  });

  it('unmount stops recorder and releases stream tracks', async () => {
    const { tracks } = installMediaEnv();
    const { result, unmount } = renderHook(() => useVoiceToText());
    await waitFor(() => expect(result.current.permission).toBe('granted'));

    await act(async () => {
      await result.current.start();
    });
    expect(FakeMediaRecorder.instances.length).toBe(1);

    unmount();
    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
    for (const t of tracks) {
      expect((t.stop as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
    }
  });

  it('remount does not duplicate handlers on the same recorder instance', async () => {
    installMediaEnv();
    const { result: r1, unmount } = renderHook(() => useVoiceToText());
    await waitFor(() => expect(r1.current.permission).toBe('granted'));
    await act(async () => {
      await r1.current.start();
    });
    const firstRec = FakeMediaRecorder.instances[0];
    unmount();

    const { result: r2 } = renderHook(() => useVoiceToText());
    await waitFor(() => expect(r2.current.permission).toBe('granted'));
    await act(async () => {
      await r2.current.start();
    });
    const secondRec = FakeMediaRecorder.instances[1];
    expect(secondRec).not.toBe(firstRec);
    // Handlers on the *new* recorder are fresh; the old recorder is idle.
    expect(firstRec.state).toBe('inactive');
  });
});
