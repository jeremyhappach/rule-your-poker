# TriTowers multiplayer v2 — 2026-10-16

Approved correction: new matches freeze `tri-towers/2`. The first valid removal
or draw during each 30-second Ready window atomically performs that action and
starts 120 seconds. An invalid action cannot start the clock. Lock-time expiry
takes precedence. Missed Ready and playing timeout end only the scheduled round,
preserving cumulative points and later rounds. Everyone plays round one, then
round two in the frozen clockwise order left of the caller through the caller.
Exactly one bonus round follows for each player at or above 80,000 after round-two
bonuses, in the same order. Results retain the five-second hold.

The failed Pedro Strop smoke never reached a human playing stage: the prior client
disabled card/stock actions during Ready and required a separate Start control.
No human action RPC reached authority; recovery expired Ready. The v2 client
enables legal first actions, and the reducer validates and admits them in the same
locked transaction. This resolves both the UI boundary and server action contract.

## One shared rule base

`src/lib/triTowers/rules-v2.json` is the versioned configuration source.
`supabase/tri-towers/v2.sql` owns mode-independent board dealing, legal actions,
scoring and clocks; it reads no seats, sessions or money. The multiplayer wrapper
owns authorization context, participant order, scheduled rounds and settlement
handoff. Future Arcade must call this same board core and freeze this same rules
version; no Solo adapter is included here. `build-v2.mjs` reproduces the migration
from these sources and the exact preserved `legacy-v1.sql` bodies.

Removal awards are 100, 200, 400, 600, 800, 1,000, 1,200, 1,500, 2,000, then 2,000.
Draw resets the streak and deducts 100 with a cumulative floor of zero. Towers add
5,000 / 10,000 / 15,000. Clear and Take Score add ten points per whole second left;
only clear adds 1,000 per unused stock card. There is no additional all-clear award.
The 28-card tableau, hidden-card rules, 23 stock draws, wrapping and CSPRNG deal
remain unchanged. Existing v1 rows dispatch to their original functions and keep
their historical rules and interpretation.

## Canonical presentation and authority

There is one active-human-only Take Score control. Timer markup is shared with
Run21 through the presentation-only `RoundTimeBar`; Run21 clocks and behavior
are unchanged. Snapshot financial context is a read-only projection of actual
player balances, final snapshots, result and immutable transfer batch. The shared
chip ledger owns balance presentation and flight replay protection. TriTowers is
registered for its existing durable cursor support. Continue waits for that
specific committed transfer to settle or reconcile; an all-player tie needs none.
The existing settlement writer, actual financial triggers, worker, session close
and next-dealer authority are preserved.

The original Oct 16 - Pedro Strop session, both matches, actions, history,
results, transfer batches and snapshots are frozen. No reconciliation is included.
Real-money admission remains prohibited and approved-account checks remain intact.

## Qualification and release

The `v2.proof.mjs` matrix uses the deployed canonical functions and financial
triggers in a disposable PostgreSQL database. Financial cases roll back and assert
actual chips, balanced transfers, one result and matching final snapshots:

| Outcome | Opening human/bot/bot | Closing human/bot/bot |
|---|---|---|
| Human win | 100 / 110 / 120 | 110 / 105 / 115 |
| Bot win | 100 / 110 / 120 | 95 / 120 / 115 |
| Mixed tie | 100 / 110 / 120 | 102 / 113 / 115 |
| All tie | 100 / 110 / 120 | 100 / 110 / 120 |

The matrix also covers duplicate settlement, request replay, stale actions,
spectator/private-core denial, concurrent workers, injected snapshot failure,
Run Back, next selection, late predecessor close and Session Ended carryover.
`v2.edges.mjs` covers first-action concurrency, lock-time expiry, pause/resume,
invalid stakes, closed admission, real money, revoked accounts and v1 equivalence.
Forty equivalent-visible-state permutations verify that bots cannot use hidden
tableau cards or future stock. Two-to-seven-player scheduling and 79,999 / 80,000 /
80,001 qualification boundaries are direct SQL proofs.

`v2.lifecycle.mjs` exercises normal-speed one-human/six-bot and mixed competitions
with zero browsers, exact round order, canonical balances, final snapshots and
duplicate recovery. `v2.browser.mjs` uses real authenticated SQL actions and
committed database notifications through a loopback SSE adapter. It covers phone,
landscape and desktop, progressive bot play, both human first actions, settlement,
one canonical flight, reload and Run Back. This substitutes for Supabase network
transport; Jeremy's production smoke remains the final acceptance test.

Admission stays closed while installing and verifying the migration and publishing
the compatible client. Only after all gates and Vercel READY may the separate
admission flag reopen. The existing one-second PostgreSQL worker invokes the new
version dispatcher directly; no browser or Edge Function deployment is needed.
Machine-readable final qualification: `dev/tri-towers/v2.evidence.json`.

## Owner production smoke

1. Refresh holm357.com and create a new fake-money session with one human and one
   bot. Select TriTowers with a five-chip stake. Keep Pedro Strop untouched.
2. Watch the bot make progressive moves. During each human Ready, tap a legal
   exposed card or stock directly. Confirm the action works and the timer starts
   full. Take Score should appear only on your active playing round.
3. Confirm bot/human round one, then bot/human round two. Any qualified bonus
   follows once. Missing Ready may end that round but must preserve the next one.
4. Finish the match. Highest cumulative score wins: at a five-chip stake the
   winner gains five and loser loses five. Watch one chip transfer and confirm
   the displayed balances. Reload must not replay it.
5. Continue, use Run Back, and later end the session. Confirm both balances carry
   through selection, the next game and Session Ended. Solo TriTowers waits for
   acceptance of this multiplayer smoke.
