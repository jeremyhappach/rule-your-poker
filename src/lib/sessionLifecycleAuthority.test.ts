import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: db.read }) }) }), rpc: db.rpc },
}));
import { requestSessionEnd } from "./sessionLifecycleAuthority";
beforeEach(() => {
  db.read.mockReset().mockResolvedValue({ data: { current_game_uuid: "dealer", timer_generation: 7 }, error: null });
  db.rpc.mockReset().mockResolvedValue({ data: { request_recorded: true, terminal_disposition: "pending_session_end" }, error: null });
});
it("returns the server's pending disposition without claiming terminal completion", async () => {
  await expect(requestSessionEnd("game")).resolves.toBe("pending_session_end");
  expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_expected_dealer_game_id: "dealer", p_expected_timer_generation: 7 });
});
it("does not issue a close request after a failed identity read", async () => {
  db.read.mockResolvedValueOnce({ data: null, error: new Error("offline") });
  await expect(requestSessionEnd("game")).rejects.toThrow("offline");
  expect(db.rpc).not.toHaveBeenCalled();
});
it("surfaces a stale phase instead of treating it as an accepted end", async () => {
  db.rpc.mockResolvedValueOnce({ data: { request_recorded: false, outcome: "stale_identity" }, error: null });
  await expect(requestSessionEnd("game")).rejects.toThrow("table changed");
});
it("treats an already-deleted room as a completed local exit", async () => {
  db.read.mockResolvedValueOnce({ data: null, error: null });
  await expect(requestSessionEnd("game")).resolves.toBe("deleted");
  expect(db.rpc).not.toHaveBeenCalled();
});
