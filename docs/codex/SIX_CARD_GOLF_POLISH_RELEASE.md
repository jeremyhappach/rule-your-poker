# Golf polish publication — October 22, 2026

Approved candidate: `98a1172b5e201d9d1e568930e482f435d3bfab38`, incorporating
`08afbece2ce6e4bbe3bbcc48fbec8640e14c4556` and the measured card-size correction.
Integration branch: `codex/golf-polish-release`. Base: published Canasta
`dc894c3cfbd3da7a30c310271e90396ed93b25b8`. Original candidate history is retained.

## Scope and preservation

The Golf product files are byte-for-byte the approved candidate after Git
normalization. The existing current-main Canasta code and shared card/chip
transport updates are retained without changes. No new Canasta product work is
included. Other game changes remain held. The unrelated Cribbage snapshot and
Supabase temporary files are excluded.

The package removes partial score helpers and Golf spotlight, adds the numbered
flag, compact Player/Score standings, nine-hole pencil scorecard and final felt
scorecard, restores prior active-card size and improves selected-pile/replacement/
discard presentation. The approved scorecard designs are unchanged. The gameplay
and financial owners, whole-turn clocks, score authority, private cards, immediate
settlement, Results deadline and canonical terminal flow are unchanged.

No schema/RPC/worker change is part of this release. Installed Golf migration
`20261022171731` and all installed Canasta migrations are preserved. Before release,
read-only production checks confirm both releases enabled/admitted, Golf defaults
1200/5000 ms, and current-main CI/release signal matching `dc894c3cf`. Canasta's
installed forward authority retains the `canasta:fake_money_only` guard.

## Qualification

The integrated actual local match with a human and two strategic bots passes,
with zero page errors, at most one concurrent card flight and at least six
represented opponent positions. The seven-viewport comparison passes exact
published/restored per-card size assertions and short-landscape scroll access.
This rechecks Golf against the current-main transport changes.

Final validation/build logs and publication verification are retained under
`qualification.local/six-card-golf/polish-release/`. TypeScript, all 2,750
application tests, all 241 harness tests and the production-configured Vite
build pass on the integrated source. The final delivery records
the pushed SHA, Vercel READY deployment, exact public manifest, CI and release
signal. The production browser check opens an existing paused qualification
match, inspects the board and scorecard, reloads and proves its authoritative
revision/tableau/pause are unchanged. It also checks the already-completed
fixture's cold reconnect returns to the lobby. It never submits gameplay or
resumes/creates a production match.

## Owner smoke

Verify the restored active cards, smaller numbered flag and two-column standings.
Tap standings to inspect the pencil scorecard. Watch a bot draw/replace/discard,
then confirm hole scoring and the 5000 ms Results overlay. On hole nine, check the
felt scorecard with the canonical winner/financial presentation and Session Ended.
Short landscape retains prior card size with scrolling inside the existing hand
area. This release does not claim Jeremy's production acceptance.
