import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));
import { createSession } from "./sessionCreation";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  db.rpc.mockReset().mockResolvedValue({ data: { outcome: "created", game_id: "game", player_id: "host" }, error: null });
});

it("reuses the exact request and money mode after a lost response", async () => {
  db.rpc.mockRejectedValueOnce(new Error("response lost"));
  await expect(createSession("host", "First name", false)).rejects.toThrow("response lost");
  const original = db.rpc.mock.calls[0][1];
  db.rpc.mockResolvedValueOnce({ data: { outcome: "already_created", game_id: "game", player_id: "host" }, error: null });
  await expect(createSession("host", "Second name", true)).resolves.toMatchObject({ game_id: "game" });
  expect(db.rpc.mock.calls[1][1]).toEqual(original);
  expect(values.size).toBe(0);
});

it("keeps uncertain transport errors retryable", async () => {
  db.rpc.mockResolvedValueOnce({ data: null, error: { code: "", message: "Failed to fetch" } });
  await expect(createSession("host", "Name", false)).rejects.toThrow("Failed to fetch");
  expect(values.size).toBe(1);
});

it("clears a definite SQL rejection without creating a second request silently", async () => {
  db.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "maintenance" } });
  await expect(createSession("host", "Name", false)).rejects.toThrow("maintenance");
  expect(values.size).toBe(0);
  expect(db.rpc).toHaveBeenCalledTimes(1);
});

it("does not resurrect a closed table on a late retry", async () => {
  db.rpc.mockResolvedValueOnce({ data: { outcome: "already_deleted", game_id: null }, error: null });
  await expect(createSession("host", "Name", false)).rejects.toThrow("previous table has closed");
  expect(values.size).toBe(0);
  expect(db.rpc).toHaveBeenCalledTimes(1);
});
