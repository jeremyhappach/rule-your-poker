import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const stripTransaction = (sql) => sql.replace(/^BEGIN;\s*$/gm, "").replace(/^ROLLBACK;\s*$/gm, "");
const candidate = process.argv.includes("--candidate");
const migration = "supabase/migrations/20261009231202_restore_all_human_auto_fold_pause.sql";
const holm = stripTransaction(read("supabase/tests/holm_settlement_boundary_rollback_proof.sql"));
// The final setup-end case creates a real-money fixture; the seven gameplay
// pause/resume cases before it are all fake-money and remain unchanged.
const pause = stripTransaction(read("supabase/tests/seven_game_pause_rollback_proof.sql"))
 .split("-- Ending neutral paused setup")[0] + "END $proof$;";
const provenance = read("supabase/tests/decision_provenance_rollback_proof.sql");
const fixture = provenance.slice(provenance.indexOf("CREATE OR REPLACE FUNCTION pg_temp.decision_proof_fixture"), provenance.indexOf("CREATE OR REPLACE FUNCTION pg_temp.decision_proof_benchmark"));
const sql = ["BEGIN;", "SET LOCAL lock_timeout='2s';", "SET LOCAL statement_timeout='90s';",
 candidate ? read(migration) : "", holm, "SET CONSTRAINTS ALL DEFERRED;", pause, fixture,
 read("supabase/tests/all_human_auto_fold_pause_rollback_proof.sql"),
 "SET CONSTRAINTS ALL IMMEDIATE;",
 "SELECT 'PASS' AS result, 'fake-money only: Holm settlement, seven-game pause, aggregate timeout and zero-client recovery' AS coverage;",
 "ROLLBACK;"].join("\n");
if (/SET real_money\s*=\s*true|VALUES[^;]*\btrue\b[^;]*real_money/is.test(sql)) throw new Error("Unexpected real-money fixture");
const output = resolve(".codex/evidence/all-human-auto-fold-pause", candidate ? "candidate.sql" : "deployed.sql");
mkdirSync(resolve(".codex/evidence/all-human-auto-fold-pause"), { recursive: true });
writeFileSync(output, sql);
console.log(output);
