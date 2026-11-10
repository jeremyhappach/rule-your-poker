# Consolidated production polish — November 10, 2026

Jeremy approved one combined release: Quintzee selectors/layout, optional bonus
Play/Skip in real-money competition, and the Run21 meter-only presentation.
He subsequently chose compact dice/layout on short screens so all twelve
Quintzee categories and 48px selectors remain visible. The dice component,
holding behavior and animation are unchanged; larger layouts preserve its size.

## Implementation and boundaries

- Quintzee uses staggered circular selectors, 48–56 CSS pixels, with inert labels
  and row backgrounds. Completed categories retain their score without a button.
  Bonuses share one line, Rules uses an information icon, Round is more prominent,
  and redundant instructions are removed. The shared view covers all three modes.
- Run21 uses the existing deadline/progress/urgency owner in a full-width 9px meter,
  including first-placement time. Visible timer text is removed; rules are unchanged.
- The new server-owned bonus decision applies to live TriTowers, Boxdrop, 11 Up and
  Royal Flash, and Async TriTowers, Quintzee and Boxdrop. It requires both main games
  complete, exactly one qualifier, and a strict win even at the lowest bonus score.
  TriTowers includes its possible draw penalties. Unknown rule versions fail closed.
  Existing disabled modes are not activated; Arcade and fake money are unchanged.
- Play retains the existing bonus board/clock. Skip adds no score or fabricated
  attempt and calls existing canonical settlement. Request receipts and locked
  identity/revision checks prevent repeat payment. Async pending choices persist
  through reconnect with the existing deadline. Unchosen timeout behavior remains.
- Existing Async TriTowers clients retain the original projection. A new service-only
  wrapper exposes decision metadata to the actor and completed-result viewers.

## Qualification before publication

- Full production-push gate: typecheck, **4,027 application tests / 550 files**,
  **241 harness tests / 12 files**, **46 tooling tests**, Vite build and 90 MB gate.
  All pass with zero failed tests or unhandled errors.
- Local production-configured output: **89,482,481 bytes / 179 files**.
- 16 live + 12 Async financial cases pass locally and against the installed hosted
  authority in a rolled-back transaction: either winner, Play/Skip, actual canonical
  balances, balanced journals/account postings, results/final snapshots, replay,
  authorization, continuation and injected post-financial-write atomic rollback.
- 21 independent-connection concurrency/fake-money cases, seven zero-client
  recovery paths, and legacy/new projection/reconnect/privacy checks pass locally.
  Proofs seed completed main rounds and exercise the real final-main handoff;
  they are not a claim that a human played every game from admission to finish.
- 12 Quintzee portrait layout checks across Arcade/live/Async at 320×568, 375×667,
  390×844 and 430×932: all categories visible, actual 48–56px targets, no overlap,
  readable labels, inert labels and working selectors. 20 Run21 checks verify
  full-width geometry, text removal, urgency, depletion and pause.
- Storage preservation: 42 pixel-identical PNGs, all 24 startup images, all 114
  public URLs, unchanged sounds/push worker/PWA identity, eight function routes and
  Run21 cle1. The prior source-freeze audit intentionally detects the two approved
  Async source edits; its assertions were not weakened. The scoped preservation
  proof checks the remaining 81 frozen files unchanged.
- One read-only implementation review found no confirmed release blocker.

Migration `20261110215626_optional_bonus_choice_and_polish.sql` was installed via
the Supabase migration tool after the full local gate. Exact preimage guards passed.
Hosted rollback proof passed all 28 cases. Follow-up confirmed five intended offer
triggers, zero remaining proof triggers/profiles, authenticated-only live authority
and service-only Async authority. No customer balances or historical matches changed.

## Controlled publication and rollback

Immediately before migration, fetched origin/main and live production remained
`098937474c1434c64f74d060eaf80c8a4a43a5ff`, retained READY deployment
`dpl_AMv1ag39r46CpWSugyxbTx7nsaFy`, explicitly rollback-eligible. The candidate
includes that complete storage release and its local documentation receipt.
No unrelated Golf checkout changes are included. No preview or deletion is needed.

Publish once through the unmodified main push helper after final diff review.
Vercel and GitHub must independently pass their normal gates and verify the exact
production commit before release signaling. Do not retry a failed publication.

If critical production smoke fails: open the owner dashboard at
https://vercel.com/jeremy-8e2b/ptown-poker → Overview → Production Deployment →
Instant Rollback (or Deployments → previous production row → … → Instant Rollback).
Select `dpl_AMv1ag39r46CpWSugyxbTx7nsaFy` / `098937474c1434c64f74d060eaf80c8a4a43a5ff`,
Continue, verify both holm357.com and ptown-poker.vercel.app, then Confirm Rollback.
Verify their build manifests and login afterward. If backend reversion is needed,
apply the generated `.polish-authority/rollback.sql` ONLY after frontend/API rollback;
it restores the four action preimages and removes the five offer triggers without
rewriting player data. Retain any already-completed legitimate results.

Physical iPhone touch comfort, normal authenticated competitive play and APNs
delivery remain Jeremy's acceptance. Use the existing installed production PWA;
do not uninstall or reinstall it. The prior storage/splash release passed his
initial device smoke. This release must preserve that behavior.
