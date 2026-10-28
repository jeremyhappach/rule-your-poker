# Words shared polish — approved release — 2026-10-28

Jeremy approved publication of the tested local polish plus compact mobile match
details. This supersedes the local-only hold in WORDS_POLISH_LOCAL.md. The exact
line `Standard Words · ENABLE2K · Two humans` is removed. Match home now has clear
scores, stake, provisional result and green/yellow turn areas. The shared Words
score/gesture and notification changes described in that local record are retained.

Base is `39f5855202efcce6dc42473a5bfcd0b323c6afc9`. Transition-audit recovery and
reopened SCC/Horses work are separate and excluded. No async time-bank policy,
multi-game activation or real-money async activation is included.

## Installed authority

Migration `20261028224553_words_shared_polish.sql` is installed once. Its initial
file was created by the cached Supabase CLI; the filename was aligned with the
MCP-assigned installed version. Do not apply it again. It adds the opponent-page
RPC/index, acceptance notification, async presentation metadata and the new-deal
shared presentation allowance. It does not change scoring, accounting or admission.

Hosted candidate and installed BEGIN/ROLLBACK proofs passed: normal, tie, child
forfeit, fixture-scoped recovery, actual canonical chips/balanced ledger, injected
rollback, replay, privacy, eligibility, opponent pagination/filter/order, acceptance
notice/read and scored presentation. `dev/async-words/release-proof.mjs` composes
the existing financial proof with `supabase/delayed/polish-proof.sql`, replacing
the global recovery sweep with the same expiry owner targeted at its synthetic
child. Rolled-back release/health overrides do not change deployed policy.

Two independent hosted SQL transactions concurrently accepted one synthetic
invitation, producing one notice. Two concurrent identical CAT commands produced
one move, +10, one presentation event and the same receipt hash. No financial
session was created for this race. The two synthetic users, match and commands
were removed; immutable guards were verified enabled afterward. Cleanup of only
those nonfinancial test receipts temporarily disabled their two immutable-delete
triggers inside a single transaction. No customer records were modified.

Independent local connections also raced final commands through the actual
canonical settlement owner and produced one parent settlement. All 15 original
authority cases passed on the candidate, including late expiry and zero-client
recovery. This terminal race evidence is local; hosted financial proofs are
rollback-contained and hosted concurrency covers the changed acceptance/move paths.

Hashes remain unchanged for `finalize_gameplay_transfer_batch`,
`record_session_results`, `settle_gameplay_chip_transfers`, `delayed_finalize` and
the live `ptown_words_present_move` trigger. Live human real money, fake bots,
fake-only one-child async and the enabled recovery heartbeat remain intact.

Security advisors retain the preexisting RLS error on
`gameplay_transfer_pending_changes`; this release does not modify that owner.
The new authenticated SECURITY DEFINER opponent RPC is intentional: active caller
validation, own relationship scope, fixed search path and no anonymous execution
are verified. No broad permission change is part of this release.

## Client and publication evidence

Actual two-identity local async browser flow passed after styling. Match details
were rendered and inspected at 320, 390 and 1440 pixels without horizontal overflow.
The earlier live shared Words browser proof remains applicable; the added match
chrome does not mount or change live lifecycle owners. Screenshots, hosted proof
receipts and validation logs are retained under `qualification.local/async-words/`.

Application typecheck, all 453 source files / 3,136 assertions and 12 harness files /
241 assertions passed. The final production bundle passed in 26.81 seconds with
the existing chunk-size/Browserslist notices.
Publication requires production READY, public build manifest, successful publisher
and persisted release signal to agree on the exact commit. Record that agreement
in the local publication receipt and release tag. Physical-device sound, score
presentation and match-details smoke remain Jeremy's acceptance step.

Publication verified: `77c7c715190e658a5393cdbbbfb79d0589d04778` is on origin/main;
Vercel deployment `dpl_H8THf9B2Y5gWE19ZJp165J9jS3SP` is READY, the public manifest
matches, and publisher run `40783024370` succeeded. The persisted release signal
records the same SHA at `2026-10-28T22:53:08.550Z`. Local publication receipt:
`qualification.local/async-words/polish-publication.json`. Physical owner smoke
remains due; it has not been claimed from viewport rendering.

After publication, multi-game work proceeds as design/reconciliation in this chat.
The preserved Run21/TriTowers prototype is evidence, not permission to activate it.
