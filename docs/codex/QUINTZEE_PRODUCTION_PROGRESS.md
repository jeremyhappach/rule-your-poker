# Quintzee production release checkpoint

Approved: solo Arcade and fake-money multiplayer only; real-money rejection is enforced in server configuration, action, settlement and recovery. Battle31 remains held. Existing authorization covers the remaining publication and activation.

## Completed

- Current main 26e79439748c8fb68b857630d1f6ebd48852984e integrated by merge b32e05c4db71dc2bd28205891ec5730fdef2e16c. One documentation-only conflict preserved both histories; no product conflict. Scoped original integration restored from retained stash. Unrelated Cribbage snapshot and old preview evidence are excluded.
- Frozen quintzee/1 rules, approved x100-x300, shared solo/multiplayer authority, immutable Classic/Modern defaults and fullscreen catalog integration. Both themes rumble 1500 ms with held dice stationary.
- Local and hosted candidate financial proofs, exhaustive 93,312 category scoring comparisons, 2/3/4-player/tie allocations, replay/continuation, pause/bots, zero-client recovery and Arcade isolation pass. Independent concurrent requests and injected rollback after chip writes pass.
- Both-theme real-adapter browser checks pass. Full main Game route passes live reconnect, connected Session Ended cleanup and fresh ended-session lobby routing. Disposable full-route clone was dropped and its server stopped.
- One combined run on integrated source: TypeScript PASS; 2,941 source tests PASS, 0 failed, 0 skipped; 241 harness tests PASS, 0 failed, 0 skipped; production bundle PASS. This supersedes the earlier 2,933-pass/one-failure run and focused correction.
- Migration 20261026015637_quintzee_v1_arcade_fake_money installed CLOSED. Installed production rollback proof passes with actual authenticated/anonymous/service roles, ownership/anonymous denial and server real-money exclusion. Authority hash 51ae3e0b769de1a1ce5f8a4b9d4e8db2.
- Recovery worker v17 ACTIVE, source verified, preserves v16 baseline and dispatch-token authentication.

## Remaining publication gates

Commit/tag scoped release; push branch; fast-forward clean main and invoke unchanged push helper. Verify exact remote SHA, CI, READY Vercel deployment, public build manifest and persisted release_publication signal. Only then run supabase/quintzee/activate.sql with verified SHA and installed authority hash, verify actual admission and deployed API authorization. Owner physical-device smoke remains acceptance truth.

## Evidence

dev/quintzee/evidence/release contains rollback, concurrency, browser, main-route, authorization, installed and source-hash evidence. Ignored qualification.local/quintzee/release holds combined-build.log and exact installed-proof.sql. The initial installed-proof request expired during disconnection; read-only reconciliation found no active qualification and zero Quintzee runs/matches, then the explicit resumed rollback proof passed. Migration was not repeated.
