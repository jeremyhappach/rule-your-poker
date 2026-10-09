import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const file of [".env", ".env.e2e.local"]) {
 for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
 }
}
// The checkout may target a separate app-test project. Require an explicit,
// connector-verified public endpoint/key; never silently inherit its .env URL.
const [configPath, mode, game, round, dealer, player, version, delayMs = "0"] = process.argv.slice(2);
const api = JSON.parse(readFileSync(configPath, "utf8"));
if (new URL(api.url).hostname !== api.projectRef + ".supabase.co") throw new Error("Project identity mismatch");
const client = createClient(api.url, api.publishableKey, {
 auth: { persistSession: false, autoRefreshToken: false }
});
const login = await client.auth.signInWithPassword({
 email: env.PTOWN_E2E_PLAYER2_EMAIL, password: env.PTOWN_E2E_PLAYER2_PASSWORD
});
if (login.error) throw new Error("Existing E2E login failed: " + login.error.message);
try {
if (!["identity", "expect-lock", "expect-accepted", "expect-stale"].includes(mode)) throw new Error("Unknown test mode");
if (mode === "identity") {
 console.log(JSON.stringify({ actorId: login.data.user.id }));
} else {
 const fixture = await client.from("games").select("real_money,name").eq("id", game).single();
 if (fixture.error || fixture.data.real_money !== false || !fixture.data.name.startsWith("Rollback proof: auto-fold concurrency")) throw new Error("Refusing a non-test session");
 await new Promise((resolve) => setTimeout(resolve, Number(delayMs)));
 const startedAt = new Date().toISOString();
 const result = await client.rpc("set_automatic_play", {
  p_game_id: game, p_round_id: round, p_dealer_game_id: dealer,
  p_player_id: player, p_expected_version: Number(version), p_enabled: true
 });
 const locked = ["55P03", "40001"].includes(result.error?.code);
 if (mode === "expect-lock" && !locked) throw new Error("Expected contention rejection; got " + JSON.stringify({ code: result.error?.code, message: result.error?.message, outcome: result.data?.outcome }));
 if (mode === "expect-accepted" && (result.error || result.data?.outcome !== "accepted")) throw new Error("Intent failed: " + JSON.stringify({ code: result.error?.code, outcome: result.data?.outcome }));
 if (mode === "expect-stale" && (result.error || result.data?.outcome !== "stale_identity")) throw new Error("Stale intent was not rejected");
 console.log(JSON.stringify({ result: "PASS", mode, startedAt, finishedAt: new Date().toISOString(), errorCode: result.error?.code, outcome: result.data?.outcome }));
}
} finally {
 await client.auth.signOut({ scope: "local" });
}
