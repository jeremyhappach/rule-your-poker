# Golf interaction release — October 22, 2026

Jeremy approved presentation candidate `5d2db057f3e15476c28a9a0274b16863b506e9c9`
and explicitly resumed publication after the temporary clarification hold.
The release integrates the already-deployed closed Canasta checkpoint
`7c43a27b854b754ef5fb0a5dd28a5f5a090a13da`, preserving its runtime exactly.
GitHub main was `52aa5528143fe031c4ddf8c3787eff85c0392aa9` at preflight.
Later Canasta commits and all other releases remain outside this release.

## Delivered behavior

- Opening selection visibly highlights the first card; the second distinct tap
  submits the existing atomic opening action.
- The local tableau stays centered in MY; opponents are centered on the felt.
- Info contains rules, completed-hole totals, inspection and Auto-play reclaim.
- Discard is left, stock is right, with an upper-left public count badge.
- Felt cards use proportional corners and the reviewed opponent sizes.

The authoritative rules, requests, privacy, timeouts, settlement and recovery
are unchanged. Source migration `20261021011905_six_card_golf_v1.sql` is already
installed as hosted migration `20261021230433`; this release does not run SQL
mutations or reapply it. Existing 22/22 candidate and 22/22 installed proofs are
documented in `SIX_CARD_GOLF_HOSTED_QUALIFICATION.md`.

## Integration correction

The first full regression run found two stale source-contract assertions from
the deployed Canasta checkpoint. Its meld selector renders a draft's rank label,
which the broad rank/suit inventory detects; actual card faces use PlayingCard.
The reviewed selector is now in the inventory. The transport assertion now checks
the existing explicit Joker validation plus hidden, simultaneous standard/Joker,
and unresolved standard-face guards. No Canasta or shared runtime was changed.

## Validation

Final application typecheck passes. `npm run validate` passes all **2,706**
application tests and **241** harness tests; the production Vite build passes.
The build uses the existing public production configuration in memory. Integrated browser qualification already passed all 63
rendered cases (2/3/4 participants, every viewer, seven viewports), opening
selection, private stock draw, reload persistence, replacement and discard
pickup/replacement. Read-only authenticated owner inspection passed at 390×844
and 844×390: snapshot HTTP 200, Realtime joined, no page errors or gameplay
actions. Both rendered screenshots were inspected directly.

Qualification artifacts remain in `qualification.local/six-card-golf/`, with
reviewed visual provenance in `dev/six-card-golf/evidence/rectangular-cards/`.
No physical-device acceptance is claimed.

## Preserved production state

Read-only October 22 preflight confirms Golf enabled and admission enabled,
preserving both money modes. Canasta admission is false with zero active grants.
The owner's dealer game `100b31e9-e196-494a-b94c-d6c7c9a95ae7` remains paused in
opening, hole 1, revision 4, zero accepted requests, no settlement. Its restricted
state digest is `54db0e908b662e88e57109dd8374696d`; no card values are recorded.

Publication is complete only after the exact integrated SHA passes the release
signal workflow, Vercel is READY, and the public build manifest serves that SHA.
Deployment IDs and the final SHA belong in the delivery evidence; a Git push
alone is not completion.

## Owner smoke

1. Refresh production. Confirm the centered MY grid, rectangular opponent cards,
   discard on the left and stock count on the right in both orientations.
2. For the preserved paused game, open Info and uncheck Auto-play if needed;
   the host then resumes explicitly.
3. Tap one opening card and check its highlight; tap a second distinct card and
   confirm both reveal. Try stock/replacement and discard pickup.
4. Reload during play and check the same hole, scores, pending draw and turn.
   Completed-hole totals remain the in-play score presentation.
