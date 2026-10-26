# Mega action flicker follow-up — local only, 2026-10-25

Owner accepted the highlight correction in published SHA
`5af9e86ff204e35d9deb573e0c6ab8c39a2abfa4`, but reported that Stand Pat/Discard
still flash enabled → disabled → enabled after replacement. The earlier release
therefore did not complete the action-flicker correction. This follow-up is
authorized only for local implementation and qualification, not publication.

## Reproduced boundary

`MegaArcadePage` subscribed to `public.arcade_revisions` UPDATE events, but threw
away their revision numbers. Every notification called the serialized refresh
path in `MegaArcade`, which set `busy` even when the command response had already
delivered that revision. A delayed draw notification could arrive after the
350 ms stock reveal, disabling the just-enabled controls until its redundant
state request finished. The earlier fixture never emitted command revision
echoes; its ten browser assertions could not exercise this sequence.

The revision comparison uses the existing wire revision: the server projection
in `server/megaCardGolf/service.ts` explicitly uses the persisted row revision,
and the existing Mega commit updates `arcade_revisions` to that same revision.
Notifications are invalidation hints only; they do not supply gameplay state.

## Frame evidence

Local touch Chrome, 390×844, actual Mega components and shared reducer, delayed
responses and revision notifications. Each animation frame records both buttons
and presentation stage. Timings below are relative to each browser navigation.

Before correction (`evidence.local/echo-before.json`, 270 frames):

- 6,350 ms: replacement response revision 4.
- 7,052 ms: revision-4 echo starts an unnecessary state request during reveal.
- 8,767 ms: automatic draw response revision 5.
- 9,136 ms: stock reveal settles; both controls enable.
- 9,468 ms: revision-5 echo starts another state request.
- 9,485 ms: both controls visibly disable.
- 9,884 ms: both enable again after the state response.

After correction (`echo-after.json`, 274 frames):

- Replacement, automatic draw and stock reveal remain continuously unavailable.
- Both controls enable once at 4,222 ms after stock reveal.
- The delayed revision-5 echo arrives at 4,550 ms without starting a request or
  changing either control.
- The exposed-card trace (`echo-after-exposed.json`, 177 frames) likewise enables
  once after reveal, with no later pulse.

The whole observed sequence changes from
`enabled → disabled (command pending) → hidden → enabled → disabled → enabled`
to `enabled → disabled (command pending) → hidden → enabled`.
No presentation or network timing was changed in product code. Test-only delays
model ordering; they are not gameplay authority or a production workaround.

## Minimal correction and preservation

`MegaArcadePage.tsx` passes valid matching-run revision numbers to the refresh
owner. `MegaArcade.tsx` ignores already-accepted/older revisions before acquiring
the input lock, and rechecks notices queued during a command after its response
is accepted. Queued notices retain the highest revision; an unversioned refresh
cannot be overwritten by a versioned notice. Newer revisions and subscription
reconnects still refresh through the existing serialized guard. Old-run callbacks
are ignored. No gameplay state is inferred from a notification.

The existing replacement/draw/reveal input gate, hidden Discard behavior,
allowances, `/1–/4` Stand Pat rules, deadlines, one-attempt protection, lost-response
recovery and keyboard access are unchanged. The accepted highlight CSS is
unchanged. No rules, defaults, API requests, database, admission, other-game or
runtime telemetry changes are included.

## Qualification

- 105 focused Mega tests in 12 files pass, including six new cases covering
  delayed echoes after both replacement paths, queued echo coverage, newer
  external revisions, queued reconnects, and the production subscription adapter.
- Application TypeScript passes with the installed compiler.
- Browser before/after traces reproduce and remove the exact late enabled /
  disabled / enabled sequence. Both corrected traces have zero page errors.
- Existing ten-case browser regression passes with zero page errors/external
  requests, including pointer/touch/keyboard, new-hole and `/1–/4` checks.
- Production Vite bundle passes (existing browser-data/chunk warnings).
  Log: `dev/mega-card-golf/ui-transitions/evidence.local/echo-build.log`.
  The local preview server was stopped after browser qualification.

New regression fixtures initially advanced replacement and stock reveal in one
batched fake-clock step. They now advance the stock reveal separately, matching
the existing tests and actual browser chronology; no product timing changed.

Changed product files: `src/components/megaCardGolf/MegaArcade.tsx` and
`MegaArcadePage.tsx`. Tests: `AutomaticStock.test.tsx`, `MegaArcadePage.test.tsx`.
Local fixtures: `dev/mega-card-golf/ui-transitions/main.tsx`, `echo-trace.mjs`.
Documentation: this file and `CURRENT_RELEASE.md`.

Jeremy approved publication of qualified candidate
`87bb797d1b3fba856ff225dcb9311782f6982790`. Physical iPhone verification remains
pending production smoke. Frame logs stay in ignored local evidence; no Library
upload or production diagnostic instrumentation was added.

## Release scope

The candidate follows published `5af9e86ff204e35d9deb573e0c6ab8c39a2abfa4`
without divergence. Its intermediate commit `def0cb8fe` records the previous
publication only. The held Battle31 smoke candidate and Quintzee candidate are
not integrated. Existing unrelated work in the main checkout is preserved.
This release contains no database migrations, admission changes, leaderboard
resets, timer bonuses or gameplay-rule changes.

Final `npm.cmd run build` passes in one invocation: application TypeScript,
2,929 source tests across 423 files, 241 harness tests across 12 files, and the
production Vite bundle. Existing browser-data/chunk-size and test-environment
warnings remain. No test required a retry. Log:
`dev/mega-card-golf/ui-transitions/evidence.local/flicker-release-build.log`.
The source suite rewrote only line endings in its Cribbage snapshot; that
generated rewrite was restored in this initially clean candidate checkout.
The pre-existing snapshot modification in the main checkout is preserved.
