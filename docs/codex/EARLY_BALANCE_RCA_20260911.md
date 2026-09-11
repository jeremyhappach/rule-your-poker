# September 11 early-balance assertion RCA

Status: RCA complete; Jeremy subsequently approved the correction. Current
implementation and validation are in REVEAL_CLOCK_FIX_20260911.md. Jeremy requested
read-only RCA after the toast-storm qualification. No application source,
database rows or deployment were changed during this investigation.

## Conclusion

The observed balance was not released before its active reveal deadline.
The $-8 to $-10 change was the final $2 leg purchase. The host changed 34 ms
after its then-current reveal deadline; the peer changed 45 ms after its own.

A later server-clock estimate caused the already-expired reveal component
to briefly render again using its cached animation timestamp. The observer
then used that later marker's revised deadline retroactively and called the
earlier balance change 25.5 ms premature. This is a real stale-clock reveal
rendering defect plus a misleading assertion diagnosis, not evidence of an
early settlement display or an incorrect payout in this saved case.

## Exact identity and evidence

- Build: e9c9a831cd5787d69531ca431119c853142c5444.
- Fake session: 40c5a462-e9a6-4537-90e4-51491d772b87.
- Dealer game: ba0ed990-acdf-4574-be10-4ccc397eea6a.
- Hand 2 / round 2: 6225c654-1de6-4d50-aed1-fe8c53a9e471.
- Winner: f4791032-1469-475d-a509-ae571854c27e.
- Journal cursor 7: leg purchase, -8 to -10. Cursor 8: sweep, -10 to 0.
  Cursor 9: pot transfer, 0 to 8. The terminal receipt records an 18-chip
  award; that total includes the 10-chip legs and 8-chip pot.

Host timeline (UTC, September 11):

| Event | Time |
|---|---|
| Active reveal's last deadline before completion | 19:32:43.261 |
| First sampled absence of reveal | 19:32:43.265 |
| First $-10 balance | 19:32:43.295 |
| First sampled winning leg award | 19:32:43.347 |
| Expired reveal marker briefly returns during sweep | 19:32:46.345 |
| Deadline carried by that late marker | 19:32:43.3205 |

The late clock estimate moves the projected deadline by 59.5 ms. It arrives
more than three seconds after actual reveal completion. The server window
and exact reveal identity are unchanged. The peer has no late reveal marker;
its unchanged strict presentation assertion passes on the original evidence.

Original evidence remains under
artifacts/toast-storm-20260911/published-qualified/toast-storm-357-qualified/.
These are retained observations/receipts: the fake session was already deleted
by guarded cleanup and was not recreated or modified for this RCA.

## Owner and failure boundary

1. Game.tsx:8559 accepts the exact current frame and refreshes its server offset.
   decisionReveal.ts:130-136 deliberately accepts new estimates for the same
   identity, also allowing authoritative pause/resume timestamp projections.
2. ThreeFiveSevenDecisionReveal.tsx:62 stores nowMs. Its animation-frame loop
   at 79-90 stops on expiry, leaving the last timestamp cached in state.
3. At line 192 a new clock is combined with that old nowMs. A smaller offset
   makes the cached timestamp fall just inside the hold beat. The component
   renders an expired reveal until the newly scheduled frame refreshes nowMs.
4. The financial owner does not use this cached renderer timestamp.
   Game.tsx:2128 and financialPresentation.ts:25-52 use current time, exact
   game/dealer/round/hand identity, completed status and the accepted cursor.
   MobileGameTable retains that admitted cursor within its game/dealer scope.
   ChipPresentationLedger releases the zero-flight leg batch once admitted.
   The recorded balance change is consistent with those guards.
5. transitionPresentation.ts:82 takes the last reveal marker's localEnd and
   compares all earlier balances against it at line 91. The expired marker
   therefore rewrites the apparent deadline for already-completed history.

The toast correction changed none of these owners. The reveal's last source
change before this investigation was passive observer metadata (b4ad49209).
The faulty cached-time rendering predates that metadata and the toast fix.

## Direct proofs

artifacts/early-balance-rca-20260911/reproduce.cjs bundles the actual reveal
component and financial-admission function into a local Chrome fixture.
Only card artwork is stubbed. It replays the recorded deadline/offset change:
hold -> expired -> unchanged-offset duplicate stays absent -> revised-offset
duplicate wrongly renders hold -> next frame removes it. At the erroneous
render, deriving the frame with current time correctly returns expired.
The actual financial gate admits the recorded leg charge after completion.
The proof passes and makes zero backend requests; reproduction.json records it.

replay.cjs runs the unchanged strict observer on the frozen evidence:

- Original host: same early-balance failure.
- Original peer: passes reveal, award, sweep, pot and setup checks.
- Diagnostic copy removing only the one proven expired marker: host passes.
- Negative control moving the leg balance into the real hold: still fails.

No balances, stage times or authoritative receipts are changed in the positive
diagnostic replay. It explains the failure; the original campaign stays failed
and full live qualification still requires a fresh run after correction.

## Recommended bounded correction

Make the reveal renderer evaluate an updated clock against current local
time, so a stopped animation's timestamp cannot revive an expired reveal.
Keep authoritative clock/pause reconciliation and existing per-client timing.
No settlement, financial-admission, transfer, animation-duration or shared
completion-barrier change is indicated. Keep the strict balance assertions.

Add a direct renderer regression for a clock update after expiry, with an
unchanged-offset control, genuinely extended server-window/pause coverage,
new identity and late-mount coverage, and a genuine early-balance negative
control. Then run the normal local checks and a fresh two-client fake-money
3-5-7 reveal/leg/winner/payout/Run Back sequence with guarded cleanup.
Jeremy subsequently approved this delivery, including publication after
validation and the fresh guarded fake-money browser qualification.
