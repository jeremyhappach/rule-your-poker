# Mega Card Golf final-stock Stand Pat — 2026-10-24

Jeremy approved this bounded rule correction through production. Base main:
f694c3d973b8aa9ff1ab2bd36361564dfece7f22. Other multiplayer fixes and pending
work are preserved. Source checkpoint: mega-final-stock-20261024.

The failure was shared by the server reducer's discard-allowance guard and the
client's disabled Discard button. New mega-card-golf/3 runs offer Stand Pat only
while the final stock card is pending. It consumes no ordinary discard, keeps all
six tableau cards, reveals every concealed card, and uses canonical Golf scoring
and the existing hole/final presentation queue. Normal replacement remains legal.
Expiry still wins at the locked commit boundary and never forces a replacement.

The /1 and /2 reducers, admitted rule/config snapshots, course settings, board IDs,
historical results, multiplayer games and financial records remain unchanged.
New starts prefer enabled /3; active runs and replayed start receipts keep their
original version. No leaderboard reset/archive or timer bonus is included.

Registration migration 20261024234530_mega_final_stock_stand_pat.sql adds /3
DISABLED and extends only start/catalog version selection, guarded by inspected
function fingerprints. The existing commit/scoring/receipt RPC is unchanged.
Activation migration 20261024234531_mega_final_stock_activate.sql is separate and
runs only after exact-SHA API/client publication and release-signal verification.
Recovery worker v15 is ACTIVE, with downloaded source exactly matching the
qualified bundle. The preceding v14 bundle reproduced exactly from main; only
Mega config/engine/service inputs differ. Existing token/claim authentication and
verify_jwt=false remain intact. Worker SHA256: 61bbef654300625fe06c6503977f7916ef32c2b5d71925089c6b3589ac78c1e9.

Qualification:
- 86 focused tests, all 2,890 source tests (415 files), 241 harness tests, 25 catalog
  checks after help-version update, application TypeScript and production build pass.
- Actual service plus locked SQL proves zero/nonzero allowance, multiple concealed
  cards, unchanged cards/discard count, canonical completion, duplicate/reconnect,
  immutable receipts/history, old active versions and continuation.
- Independent connections prove competing commits, same-request replay and a commit
  blocked across expiry: exactly one result; expiry scores the original tableau.
- Shared recovery initializes /3 and completes elapsed zero-client runs.
- Candidate and installed hosted rollback proofs pass ownership/version guards,
  start selection, canonical nine-hole Stand Pat completion, exact-once results,
  continuation, service-only grants and historical preservation. Fixtures roll back.
- Chrome mobile checks pass zero/one allowance, visible Stand Pat, unchanged cards,
  reveal/result order and non-final denial; no external requests or page errors.

Fixture corrections: immutable config/created_at guards rejected two invalid local
setup writes. The fixture now creates config revisions through the canonical save
RPC and models elapsed recovery using local saved state. A consumed dispatch token
was correctly rejected; each local dispatch now receives a fresh fixture token.
No guard was weakened. The browser fixture now uses the actual Arcade page wrapper.
No tools or dependencies were installed. Existing build warnings remain.
The security advisor retains the unrelated gameplay_transfer_pending_changes RLS
finding; this release changes no policies/grants. Reference:
https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled

Repro: dev/mega-card-golf/final-stock/proof.mjs uses a unique disposable loopback
PostgreSQL database and inspected baseline definitions in evidence.local/baseline.json.
Browser: dev/mega-card-golf/final-stock/browser.mjs against the local preview on 5193.
Ignored evidence.local contains SQL rollback proofs, JSON, worker bundle and PNGs.
Production smoke remains Jeremy's acceptance step. Refresh, start a new /3 course,
reach the final stock with zero discards, and compare Stand Pat versus replacement.
