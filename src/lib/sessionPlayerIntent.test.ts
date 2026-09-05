import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ single: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: db.single }) }) }), rpc: db.rpc },
}));
import { declineSessionSetup, setSessionPlayerIntent, transferSessionHost } from "./sessionPlayerIntent";

beforeEach(() => {
  db.single.mockReset().mockResolvedValue({ data: { game_id: "game", intent_version: 3, games: { current_game_uuid: "dealer" }, host_version: 2 }, error: null });
  db.rpc.mockReset().mockResolvedValue({ data: { outcome: "accepted", player: { id: "player" } }, error: null });
});

it("serializes same-player gestures until the prior result arrives", async () => {
  let release!: (value: unknown) => void;
  db.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = setSessionPlayerIntent("player", "auto_ante", true);
  await vi.waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
  const second = setSessionPlayerIntent("player", "auto_ante_runback", true);
  await Promise.resolve();
  expect(db.single).toHaveBeenCalledTimes(1);
  release({ data: { outcome: "accepted", player: { id: "player" } }, error: null });
  await Promise.all([first, second]);
  expect(db.single).toHaveBeenCalledTimes(2);
  expect(db.rpc.mock.calls.map(c => c[1].p_option)).toEqual(["auto_ante", "auto_ante_runback"]);
});

it("does not convert failed reads into default-version writes", async () => {
  db.single.mockResolvedValueOnce({ data: null, error: new Error("offline") });
  await expect(setSessionPlayerIntent("read-failed", "rejoin")).rejects.toThrow("offline");
  expect(db.rpc).not.toHaveBeenCalled();
});

it("rejects a stale receipt and allows the next deliberate gesture", async () => {
  db.rpc.mockResolvedValueOnce({ data: { outcome: "stale_identity" }, error: null });
  await expect(setSessionPlayerIntent("stale", "rejoin")).rejects.toThrow("participation changed");
  await expect(setSessionPlayerIntent("stale", "rejoin")).resolves.toEqual({ id: "player" });
});

it("propagates lost command responses instead of claiming success", async () => {
  db.rpc.mockRejectedValueOnce(new Error("response lost"));
  await expect(setSessionPlayerIntent("lost", "stand_up_next_hand")).rejects.toThrow("response lost");
});

it("accepts a duplicate setup receipt but rejects a moved setup", async () => {
  db.rpc.mockResolvedValueOnce({ data: { outcome: "already_declined" }, error: null });
  await expect(declineSessionSetup("game", 1, "deadline")).resolves.toBeUndefined();
  db.rpc.mockResolvedValueOnce({ data: { outcome: "stale_identity" }, error: null });
  await expect(declineSessionSetup("game", 1, "deadline")).rejects.toThrow("setup has changed");
});

it("rejects a competing host transfer", async () => {
  db.rpc.mockResolvedValueOnce({ data: { outcome: "stale_identity" }, error: null });
  await expect(transferSessionHost("game", "target")).rejects.toThrow("host changed");
});
