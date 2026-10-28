import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ single: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: db.single }) }) }), rpc: db.rpc },
}));
import { declineSessionSetup, setSessionPlayerIntent, transferSessionHost, setAutomaticPlay } from "./sessionPlayerIntent";

beforeEach(() => {
  db.single.mockReset().mockResolvedValue({ data: { game_id: "game", intent_version: 3, games: { current_game_uuid: "dealer" }, host_version: 2 }, error: null });
  db.rpc.mockReset().mockResolvedValue({ data: { outcome: "accepted", player: { id: "player" } }, error: null });
});

it("binds automatic play to the rendered round and current intent version", async () => {
  await setAutomaticPlay("game", "round", "dealer", "player", false);
  expect(db.rpc).toHaveBeenCalledWith("set_automatic_play", {
    p_game_id: "game", p_round_id: "round", p_dealer_game_id: "dealer", p_player_id: "player",
    p_expected_version: 3, p_enabled: false,
  });
});

const frame = (round='live',version=4)=>({data:{game:{status:'in_progress'},identity:{round_id:round,dealer_game_id:'runback'},viewer_player_id:'player',players:[{id:'player',intent_version:version}]},error:null});
const holmFrame = (version = 4, currentHand = 2, status = 'betting') => ({ data: {
  game_id: 'game', intent_version: version, games: {
    status: 'in_progress', game_type: 'holm-game', current_game_uuid: 'dealer', current_round: 1, total_hands: currentHand,
    rounds: [
      { id: 'old', dealer_game_id: 'dealer', hand_number: 1, round_number: 1, status: 'completed' },
      { id: 'live', dealer_game_id: 'dealer', hand_number: 2, round_number: 1, status },
      { id: 'prepared', dealer_game_id: 'dealer', hand_number: 3, round_number: 1, status: 'dealing' },
      { id: 'other-dealer', dealer_game_id: 'other', hand_number: 2, round_number: 1, status: 'betting' },
    ],
  },
}, error: null });
it('reclaims HOLM against the published hand despite a held predecessor or locally prepared successor', async () => {
  db.single.mockResolvedValue(holmFrame());
  for (const displayed of ['old', 'prepared']) {
    await setAutomaticPlay('game', displayed, 'dealer', 'player', false, 'holm-game');
    expect(db.rpc).toHaveBeenLastCalledWith('set_automatic_play', expect.objectContaining({
      p_round_id: 'live', p_dealer_game_id: 'dealer', p_expected_version: 4, p_enabled: false,
    }));
  }
});
it('explains a nonactionable HOLM hand instead of submitting a completed or speculative identity', async () => {
  db.single.mockResolvedValueOnce(holmFrame(4, 1));
  await expect(setAutomaticPlay('game', 'old', 'dealer', 'player', false, 'holm-game')).rejects.toThrow('still being prepared');
  expect(db.rpc).not.toHaveBeenCalled();
});
it('retries a rejected HOLM hand race once, but preserves a competing participation change', async () => {
  db.single.mockResolvedValueOnce(holmFrame()).mockResolvedValueOnce(holmFrame(4, 3));
  db.rpc.mockResolvedValueOnce({ data: { outcome: 'stale_identity' }, error: null });
  await setAutomaticPlay('game', 'old', 'dealer', 'player', false, 'holm-game');
  expect(db.rpc).toHaveBeenLastCalledWith('set_automatic_play', expect.objectContaining({ p_round_id: 'prepared', p_expected_version: 4 }));
  db.rpc.mockClear().mockResolvedValueOnce({ data: { outcome: 'stale_identity' }, error: null });
  db.single.mockResolvedValueOnce(holmFrame()).mockResolvedValueOnce(holmFrame(5, 3));
  await expect(setAutomaticPlay('game', 'old', 'dealer', 'player', false, 'holm-game')).rejects.toThrow('participation changed');
  expect(db.rpc).toHaveBeenCalledTimes(1);
});
it('does not retry uncertain HOLM writes or cross a game-type change', async () => {
  db.single.mockResolvedValueOnce(holmFrame());
  db.rpc.mockRejectedValueOnce(new Error('response lost'));
  await expect(setAutomaticPlay('game', 'old', 'dealer', 'player', false, 'holm-game')).rejects.toThrow('response lost');
  expect(db.rpc).toHaveBeenCalledTimes(1);
  db.rpc.mockClear();
  const changed = holmFrame(); changed.data.games.game_type = 'horses';
  db.single.mockResolvedValueOnce(changed);
  await expect(setAutomaticPlay('game', 'old', 'dealer', 'player', false, 'holm-game')).rejects.toThrow('participation changed');
  expect(db.rpc).not.toHaveBeenCalled();
});
it('clears 357 automatic play using one fresh atomic frame despite a stranded rendered dealer game', async()=>{
  db.rpc.mockResolvedValueOnce(frame());
  await setAutomaticPlay('game','old-round','old-dealer','player',false,'3-5-7');
  expect(db.single).not.toHaveBeenCalled();
  expect(db.rpc).toHaveBeenLastCalledWith('set_automatic_play',expect.objectContaining({p_round_id:'live',p_dealer_game_id:'runback',p_expected_version:4,p_enabled:false}));
});
it('retries one rejected stop across a round change while preserving the participation CAS',async()=>{
  db.rpc.mockResolvedValueOnce(frame()).mockResolvedValueOnce({data:{outcome:'stale_identity'},error:null}).mockResolvedValueOnce(frame('next'));
  await setAutomaticPlay('game','old','old','player',false,'357');
  expect(db.rpc).toHaveBeenLastCalledWith('set_automatic_play',expect.objectContaining({p_round_id:'next',p_expected_version:4}));
});
it('does not overwrite a competing participation change or retry a lost write response',async()=>{
  db.rpc.mockResolvedValueOnce(frame()).mockResolvedValueOnce({data:{outcome:'stale_identity'},error:null}).mockResolvedValueOnce(frame('next',5));
  await expect(setAutomaticPlay('game','old','old','player',false,'357')).rejects.toThrow('participation changed');
  expect(db.rpc.mock.calls.filter(c=>c[0]==='set_automatic_play')).toHaveLength(1);
  db.rpc.mockReset().mockResolvedValueOnce(frame()).mockRejectedValueOnce(new Error('lost'));
  await expect(setAutomaticPlay('game','old','old','player',false,'357')).rejects.toThrow('lost');
  expect(db.rpc).toHaveBeenCalledTimes(2);
});

it("rejects a stale automatic-play request without a browser fallback write", async () => {
  db.rpc.mockResolvedValueOnce({ data: { outcome: "stale_identity" }, error: null });
  await expect(setAutomaticPlay("game", "old-round", "dealer", "player", false)).rejects.toThrow("turn or participation changed");
  expect(db.rpc).toHaveBeenCalledTimes(1);
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
