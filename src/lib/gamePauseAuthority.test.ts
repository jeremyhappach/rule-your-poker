import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ single: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: db.single }) }) }), rpc: db.rpc },
}));
import { setGamePaused } from "./gameTimerAuthority";
beforeEach(() => {
  db.single.mockReset().mockResolvedValue({ data: { current_game_uuid: "dealer", pause_version: 4 }, error: null });
  db.rpc.mockReset().mockResolvedValue({ data: { outcome: "paused", is_paused: true }, error: null });
});
it("submits exact pause identity without client-authored deadlines", async () => {
  await setGamePaused("game", true);
  expect(db.rpc).toHaveBeenCalledWith("set_game_paused", {
    p_game_id: "game", p_paused: true, p_expected_dealer_game_id: "dealer", p_expected_pause_version: 4,
  });
});
it("does not guess pause identity after a failed read", async () => {
  db.single.mockResolvedValueOnce({ data: null, error: new Error("offline") });
  await expect(setGamePaused("game", false)).rejects.toThrow("offline");
  expect(db.rpc).not.toHaveBeenCalled();
});
it("preserves rejection and lost-response evidence for the caller", async () => {
  db.rpc.mockResolvedValueOnce({ data: { outcome: "stale_identity" }, error: null });
  await expect(setGamePaused("game", false)).resolves.toMatchObject({ outcome: "stale_identity" });
  db.rpc.mockRejectedValueOnce(new Error("response lost"));
  await expect(setGamePaused("game", false)).rejects.toThrow("response lost");
});
