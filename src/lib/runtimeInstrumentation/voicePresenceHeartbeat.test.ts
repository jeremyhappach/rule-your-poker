// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserMock, getSessionMock, upsertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  getSessionMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock, getSession: getSessionMock },
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
    getSessionMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null });
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
    vi.restoreAllMocks();
  });

  it("keeps one auth/upsert flight and coalesces a stalled burst to the newest context", async () => {
    const firstWrite = deferred<{ data: null; error: null }>();
    upsertMock
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue({ data: null, error: null });

    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();

    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    heartbeat.setVoicePresenceContext({ game_id: "game-old" });
    heartbeat.setVoicePresenceContext({ game_id: "game-new", session_id: "session-new" });
    heartbeat.refreshVoicePresenceHeartbeat();
    vi.advanceTimersByTime(12_000);
    await flushPromises();

    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    firstWrite.resolve({ data: null, error: null });
    await flushPromises();

    expect(getSessionMock).toHaveBeenCalledTimes(2);
    expect(getUserMock).not.toHaveBeenCalled();
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

    expect(getSessionMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[1][0][0]).toMatchObject({
      game_id: "game-after-failure",
      status: "active",
    });
  });

  it("keeps the four-second cadence without network identity lookups", async () => {
    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(upsertMock).toHaveBeenCalledTimes(4);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("waits for a signed-in session and uses the current account on each beat", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();
    expect(upsertMock).not.toHaveBeenCalled();

    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "user-2" } } }, error: null });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0][0].user_id).toBe("user-2");

    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "user-3" } } }, error: null });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(upsertMock.mock.calls[1][0][0].user_id).toBe("user-3");
  });

  it.each([null, "user-2"])("rechecks the session after a stalled write when the account becomes %s", async (nextUser) => {
    const firstWrite = deferred<{ data: null; error: null }>();
    upsertMock.mockImplementationOnce(() => firstWrite.promise).mockResolvedValue({ data: null, error: null });
    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();
    getSessionMock.mockResolvedValue({ data: { session: nextUser ? { user: { id: nextUser } } : null }, error: null });
    heartbeat.setVoicePresenceContext({ game_id: null, session_id: null });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    firstWrite.resolve({ data: null, error: null });
    await flushPromises();
    expect(upsertMock).toHaveBeenCalledTimes(nextUser ? 2 : 1);
    if (nextUser) expect(upsertMock.mock.calls[1][0][0]).toMatchObject({ user_id: nextUser, game_id: null, session_id: null });
  });

  it("skips a failed session refresh and recovers on the next heartbeat", async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null }, error: new Error("refresh failed") });
    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();
    expect(upsertMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("preserves hidden and leaving observations", async () => {
    const documentEvents = vi.spyOn(document, "addEventListener");
    const windowEvents = vi.spyOn(window, "addEventListener");
    const heartbeat = await import("./voicePresenceHeartbeat");
    heartbeat.startVoicePresenceHeartbeat();
    await flushPromises();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const visibility = documentEvents.mock.calls.find(([event]) => event === "visibilitychange")![1] as EventListener;
    visibility(new Event("visibilitychange"));
    await flushPromises();
    expect(upsertMock.mock.calls.at(-1)![0][0].status).toBe("hidden");
    const pagehide = windowEvents.mock.calls.find(([event]) => event === "pagehide")![1] as EventListener;
    pagehide(new Event("pagehide"));
    await flushPromises();
    expect(upsertMock.mock.calls.at(-1)![0][0].status).toBe("leaving");
  });
});
