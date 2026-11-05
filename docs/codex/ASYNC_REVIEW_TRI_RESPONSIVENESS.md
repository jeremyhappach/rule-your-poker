# Async score emphasis and TriTowers responsiveness — November 5, 2026

Approved scope: five-game review emphasis; bounded Ready intentions in Async and
Arcade; one Async TriTowers database operation using existing rule, receipt,
commit and financial authorities. Physical iPhone PWA acceptance is pending.
Release checkpoint: `release-async-review-tri-responsiveness-20261105`;
the `-verified` annotated tag records the exact production publication.

## Deployed baseline and PWA

The production manifest and Vercel deployment `dpl_4pwNVo5GP2F6Do6eNyovqngqSHiB`
identified build `84696641119d3aaa2c432f6284cb82343fe067a2` before this work.
Its actual lazy Async chunk `Delayed-TKAvF2us.js` contains the ordered buffer from
`47939ceff`. That fix was deployed and active, but excluded successors while the
confirmed board was still Ready. The board's adjacency check independently used
the old waste card during Ready. First-tap-only measurement missed both boundaries.

An already-open PWA can retain older JavaScript. The push service worker has no
fetch/cache handler; release checks compare the no-store manifest at entry/resume
and deliberately preserve a live table. A fresh launch after publication is
required for device acceptance. No installed-phone build was available to inspect.

## Ownership and correction

| Game | Audit finding | Correction |
| --- | --- | --- |
| TriTowers | Replay overwrote actor emphasis with viewer identity | Honor supplied review score context |
| Run21 | Saved-result pill explicitly highlighted viewer | Honor supplied review score context |
| Quintzee | Replay overrode presentation turn index with viewer | Use the presentation actor already in the snapshot |
| Boxdrop | Replay overrode each score's active flag | Honor supplied review score context |
| Words | Complete-phase review disabled both highlights | Explicit presentation-only reviewed actor survives countup and hold |
| Take 2 | Already honors the reviewed actor | No correction |
| Mega Card Golf | Uses hole scorecard, not this score-pill presentation | No correction |

All applicable shared-view callers were audited: Async SavedBoard/DelayedTurn,
Arcade solo adapters, live game/table adapters and WordsTurn/PtownWordsTable.
Only saved review supplies the new Words presentation actor. ReviewGate still
owns review completion and its three-second final hold; AsyncTurnStage still
finishes YOUR TURN before mounting the playable owner. Terminal review keeps its
actor until ChildResults admits the game-over presentation. Database turn owner,
input admission and review acknowledgements are unchanged.

The existing TriIntentBuffer retains at most four exposed-card removal intentions
behind the first Ready move. It assigns each request its confirmed revision only
when sent. Hidden cards, duplicate taps, stock draws and non-removal barriers stay
blocked. Rejection cancels dependent intentions; uncertain delivery preserves the
exact request for recovery. No speculative score, clock, removal or animation.

`server/delayed/service.ts` routes the verified user's TriTowers command to
`public.delayed_tri_step`. SQL rechecks stored game, actor, revision, segment,
deadlines and request fingerprint. The existing `delayed_tri_core` performs every
deal/reduction/projection; existing `delayed_commit` retains receipt, review,
continuation, settlement and financial ownership. Internal orchestration and
projection replace network hops, not gameplay rules. Other games and the worker
retain their existing path. Legacy/new requests share receipts in both directions.

## Measured browser behavior

Headless desktop Edge, mobile touch viewport 390×844, actual Async/Arcade components,
four exposed consecutive cards tapped about 100 ms apart. Isolated fixture server
responses delayed 180 or 600 ms. Every case ran Sounds on and off, starting in
Ready and already-playing. These fixed-response checks isolate client behavior;
they do not measure the database consolidation or physical iOS rendering/audio.

Before: every Ready case submitted only **1 of 4** valid taps, with no pending
feedback for successors. After: **4 of 4** in all 16 cases. Already-playing
submitted 4 of 4 before and after. After pending paint was **7–29 ms**, median
**14.5–14.6 ms**, across first and consecutive taps. This is usually one frame,
occasionally two; it is not zero-latency confirmation. Sounds on/off did not
introduce a systematic wait. There were no browser errors.

Values below are tap-to-confirmed-removal milliseconds, **Sounds on / off**.
The fourth value is measured from the fourth tap, not from the first tap.

| Response delay | Phase / mode | First before → after | Fourth before → after |
| --- | --- | --- | --- |
| 180 ms | Ready Async | 230/228 → 203/206 | dropped → 465/465 |
| 180 ms | Ready Arcade | 202/232 → 230/213 | dropped → 515/449 |
| 180 ms | Playing Async | 197/244 → 215/201 | 469/506 → 487/465 |
| 180 ms | Playing Arcade | 200/245 → 233/213 | 471/500 → 515/486 |
| 600 ms | Ready Async | 634/647 → 637/631 | dropped → 2172/2171 |
| 600 ms | Ready Arcade | 634/643 → 629/629 | dropped → 2170/2159 |
| 600 ms | Playing Async | 632/631 → 635/650 | 2171/2136 → 2169/2153 |
| 600 ms | Playing Arcade | 632/632 → 644/633 | 2162/2148 → 2151/2170 |

The complete real-component review sequence was captured in Edge: opponent solid
at review start, centered countup and completed-result hold; viewer dim; zero
enabled cards throughout. YOUR TURN has no score pills and zero enabled cards.
Afterward viewer is solid, opponent dim and 28 exposed controls admitted by the
fixture. Component tests cover all five review-to-turn gates and Words terminal
countup/hold, including no-next-turn and resumed review. Existing announcement,
input locks and audio lifetime remain intact.

## Measured server path

Actual service, deployed-equivalent PostgreSQL rules/commit/projection in an
isolated local clone. Controlled **40 or 120 ms per RPC** represents a range of
server-to-database round-trip delay, not a measured production network. Four
sequential valid draws exercise Ready and playing with/without a prior own result.
Both paths use the same database fixture and clocks. Browser/device transit,
function cold start and physical sound output are excluded.

| Per-RPC delay | Prior own result | Four moves before → after | Calls before → after |
| --- | --- | --- | --- |
| 40 ms | No | 772–783 → 196–197 ms | 16 → 4 |
| 40 ms | Yes | 956–994 → 196 ms | 20 → 4 |
| 120 ms | No | 2049–2080 → 502–516 ms | 16 → 4 |
| 120 ms | Yes | 2557–2558 → 527–531 ms | 20 → 4 |

First move: 192–245 → 46–54 ms at 40 ms/RPC; 508–662 → 124–132 ms at
120 ms/RPC. The remaining three improve similarly. Approximately **74–80%** less
controlled service time. Async now has the same one-RPC structure as Arcade;
their real hosted processing costs are not claimed identical. No parallel move
submissions or early authoritative scoring are introduced. A 600 ms end-to-end
response still visibly delays confirmations even though pending input is immediate.

## Authority, validation and rollback

Migration **20261105232926_async_tri_atomic_step.sql** is additive and installed.
`supabase/delayed/tri-step-proof.sql` passes against the hosted database within
BEGIN/ROLLBACK, before and after installation. Synthetic accounts/matches are
rolled back. It exercises real rules, frozen configuration, private projection,
authorization, Ready clock start, expiry recovery, duplicate/conflicting/stale and
late receipts, continuation, winner/tie, both money modes, actual canonical chips,
balanced transfers/account postings, final snapshots and terminal lifecycle.
Injected post-financial-write failure proves atomic rollback of all artifacts.

Independent local database connections prove duplicate delivery commits once,
competing revisions accept once, action/state deadline races advance once and
terminal settlement occurs once in both money modes. 180 SQL/TypeScript parity
cases cover frozen rule versions 3/4/5 and transition/projection outcomes.
Cross-deployment receipt replay passes in every server latency scenario.

App TypeScript passes. Full application suite: **3835 pass, 10 existing failures**
in DealerGameSetup stake defaults and Mega Card Golf defaults; all ten reproduce
on unchanged main. Focused service routing tests: 3 pass. Harness suite: **241 pass**.
Production Vite build passes; npm build stops at those known unrelated test failures.
The focused review/input/adapter/audio suite also passes (95 checks before the
additional routing and terminal-emphasis assertions).

Reproduction scripts and compact baseline/after evidence are in
`dev/async-tri-step/`. Local DB scripts reuse the existing disposable Postgres
fixture; no dependency installation or production player action is needed.
Browser scripts reuse the existing actual-component transport fixtures.

Rollback: first republish the prior application/API build `846966411...` through
the normal release procedure. Keep the additive SQL operation while clients drain;
its command receipts are compatible with both paths. Optional later removal uses
`supabase/delayed/tri-step-rollback.sql`. Never revert gameplay, scores, receipts,
financial data or the shared core/commit functions.

## Physical acceptance still required

Fresh-launch the installed iPhone PWA and confirm the published build. Review an
opponent result in each corrected game through countup, final hold and YOUR TURN;
verify no gameplay input during review and correct emphasis once playable. Include
a terminal result with no next turn. In Async and Arcade TriTowers, test four rapid
valid exposed-card moves both from Ready and while playing, Sounds on/off, on the
same network; include slower cellular service. Check immediate pending feedback,
ordered confirmations, clean rejection/reconnect recovery and unchanged animations.
Desktop checks cannot establish physical tap feel or audible iPhone playback.
