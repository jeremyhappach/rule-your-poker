import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return { rpc: vi.fn(), from: vi.fn(), query };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
import { leaveSession, takeSessionSeat } from "./sessionParticipation";

describe("participation receipt handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    from.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
  });
  it("does not report success when a delayed departure is rejected", async () => {
    rpc.mockResolvedValue({ data: { outcome: "stale-participation" }, error: null });
    await expect(leaveSession("game", "player", 4)).rejects.toThrow("participation changed");
  });
  it("does not retry a failed seat command with a newer participation version", async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: "player", participation_version: 6 }, error: null });
    rpc.mockResolvedValue({ data: { outcome: "stale-participation" }, error: null });
    await expect(takeSessionSeat("game", "user", 2)).rejects.toThrow("participation changed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("session_take_seat", {
      p_game_id: "game", p_position: 2, p_player_id: "player", p_expected_version: 6,
    });
  });
  it("rejects a terminal table's seat response", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    rpc.mockResolvedValue({ data: { outcome: "already-session-ended" }, error: null });
    await expect(takeSessionSeat("game", "user", 2)).rejects.toThrow("no longer accepting");
  });
  it("propagates database failures before navigation can occur", async () => {
    const failure = { message: "transaction failed" };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(leaveSession("game", "player", 1)).rejects.toBe(failure);
  });
});
