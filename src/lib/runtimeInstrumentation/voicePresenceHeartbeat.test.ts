// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserMock, upsertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

vi.mock("@/lib/runtimeInstrumentation/voiceOperation", () => ({
  getActiveVoiceOperationId: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("voice presence heartbeat request ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    getUserMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    fromMock.mockReturnValue({ upsert: upsertMock });
    window.sessionStorage.clear();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps one auth/upsert flight and coalesces a stalled burst to the newest context", async () => {
    const firstWrite = deferred<{ data: null; error: null }>();
    upsertMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue({ data: null, error: null });

    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();

    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    heartbeat.setVoicePresenceContext({ game_id: "game-old" });
    heartbeat.setVoicePresenceContext({ game_id: "game-new", session_id: "session-new" });
    heartbeat.refreshVoicePresenceHeartbeat();
    vi.advanceTimersByTime(12_000);
    await flushPromises();

    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    firstWrite.resolve({ data: null, error: null });
    await flushPromises();

    expect(getUserMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[1][0][0]).toMatchObject({
      user_id: "user-1",
      game_id: "game-new",
      session_id: "session-new",
      status: "active",
    });
  });

  it("drains the newest pending observation after a failed best-effort write", async () => {
    const firstWrite = deferred<{ data: null; error: null }>();
    upsertMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue({ data: null, error: null });

    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();
    heartbeat.setVoicePresenceContext({ game_id: "game-after-failure" });

    firstWrite.reject(new Error("temporary Data API failure"));
    await flushPromises();

    expect(getUserMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[1][0][0]).toMatchObject({
      game_id: "game-after-failure",
      status: "active",
    });
  });
});
