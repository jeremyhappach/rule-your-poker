# Holm solo showdown exposure — September 15, 2026

Jeremy approved the correction after two production-build practice tests reproduced the folded viewer freezing at 12 of 16 card receipts. The solo resolver did not mark the stayer's hand public; canonical history privacy correctly withheld that ungranted hand, so the viewer could not start the tabled-card presentation.

Migration `20260915161215_holm_solo_card_exposure.sql` adds one scoped exposure write inside `holm_submit_decision_core`, after all decisions and card validation, before the existing community/Chucky reveal and settlement. Only the exact solo stayer row becomes public. Existing `history_exposure` records the grant in the same transaction. There are no policy relaxations, new RPCs, client changes, historical repairs, rule changes, or replay extensions.

The resolver source is replaced with one exact, idempotent fragment; unexpected deployed source fails closed. Existing function ownership, ACLs, financial paths and signatures are retained. The authoritative write adds one exact-hand update and the existing append-only history event, with no new client round trip.

## Validation

- Before deployment, the migration and proof ran in a transaction that rolled back. After deployment, the same proof passed again and rolled back all fixtures.
- Seven cases cover solo win/loss/tie, Last Game win and carry-forward outcomes, all-fold, authenticated pre-reveal and post-reveal visibility, protected folded cards, exactly one history exposure, unauthorized actions, duplicates, same-hand replay, late replay, terminal disposition, successor creation and exact chip conservation.
- The proof's initial parser error and incorrect Last Game loss expectation were corrected against the documented rule: only the final award ends the dealer game/session. No gameplay rule changed.
- The deployed migration is `20260915161215_holm_solo_card_exposure`.
- Two strict post-change browser runs completed both viewers' reveals and winner presentation. The unchanged payout recorder could not establish the host animation's final frame (100 ms and 127 ms observation gaps). These runs remain inconclusive for full payout-animation qualification; they are not counted as passes. Both fake sessions were cleaned up.
- The new functional regression passed twice against production: four opening self cards, two community faces/two backs, complete solo/community/Chucky reveal on both clients, winner announcement, protected folded cards, Run Back with a new dealer-game identity, legal successor actions and the following hand opening. Sessions `383bd25d-452c-4490-a969-a53e358fa70e` and `e1c68923-7635-4867-9a6a-57e3c996fc67` both have verified cleanup. Log: `artifacts/holm-stress/fixed-functional-v2.log` in the primary workspace.
- The first functional attempt caught an immediate test assertion against the predecessor while normal all-fold progression was still pending. The test now waits for the authoritative successor identity; no gameplay timing or assertions were weakened.
- Boundary recovery stress passed: seven two-client hand openings, 12 legal decisions, nine pause/resume cycles, six reloads and four disconnects, including six fault injections during successor transitions. The observer recorded no sustained card loss or page errors. Session `d292d62f-92c5-4b90-af07-1359926ecaac` has verified cleanup. Evidence: `test-results/holm-boundary-20260915/` and `artifacts/holm-stress/fixed-boundary.log` in the primary workspace.

## Recovery and remaining scope

The pre-change deployed resolver definition is preserved locally in `artifacts/holm-stress/rollback-solo-exposure.sql`. Restoring that function body reverses the code change without deleting truthful exposures already committed. Returning to the old body would restore the known solo-viewer defect; roll forward is preferred. This migration does not rewrite historical sessions.

The separate report of every card disappearing during a later live hand remains unproven. The earlier diagnostic exports were captured after recovery. Boundary recovery stress passed, but these bounded runs are not proof that every disappearance symptom is fixed. Jeremy's fresh production smoke remains pending.

Original reproduction: `docs/codex/HOLM_CARD_STRESS_20260915.md` in the primary workspace. Raw browser evidence and logs remain in `test-results/holm-fixed-runback-20260915/` and `artifacts/holm-stress/` in that workspace.
