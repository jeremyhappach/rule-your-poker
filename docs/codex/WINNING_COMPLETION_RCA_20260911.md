# Winning-animation completion investigation — September 11

Status: read-only investigation started when Jeremy asked what is next.
The final-animation completion entry is the highest-priority actionable
verification blocker. No application or production state was changed.

## Confirmed local defect

LegEarnedAnimation starts a 1,800 ms winning-leg timer when its effect calls
setVisible(true). Its timer hides the node and calls onComplete regardless of
the browser's CSS animation state. The ordinary leg uses the same path at
1,500 ms. The browser's animation timeline can start later than that timer.

The actual-renderer local Chrome probe in
artifacts/winning-completion-rca-20260911/probe.cjs recorded native animation
state inside the component's real onComplete callback:

| Probe | CSS progress at callback | Declared duration | Browser state |
|---|---:|---:|---|
| Normal playback | 1,735.9 ms | 1,800 ms | running |
| Main-thread work before first paint | 1,782.8 ms | 1,800 ms | running |

Neither probe received a winning-leg animationend before removal. Both made
zero backend requests. They use the production component and its own keyframes;
the fixture supplies the same animation declaration normally supplied by
Tailwind. This is direct evidence that elapsed JS time is not proof that the
visible winning-leg animation completed.

## Ownership and scope

- LegEarnedAnimation.tsx:79-102 owns the timer, cycle dedupe and completion.
- Its only rendered call site is MobileGameTable.tsx:13255, the 3-5-7 leg
  award. Normal-leg completion emits the exact round presentation receipt;
  the terminal path validates the descriptor generation, dealer identity and
  award stage, then starts legs-to-player from onComplete.
- The descriptor owner at MobileGameTable.tsx:9992 onward already removed an
  independent competing timer. The remaining timer is inside the renderer
  that the descriptor treats as its completion authority.
- The test observer's recent-sample retirement fallback can count a node
  removed after its JS deadline as completed without animationend. When the
  last visible sample is >=100 ms old, it reports an observation gap. Thus a
  passing short-gap observation does not independently prove native CSS end.
- LegsToPlayerAnimation separately clears flights with a 3,500 ms + stagger
  timer. Its missing sweep marker and canonical pot completion observations
  remain separate evidence questions; no diagnosis of those paths is claimed.

## Recommended next correction

Replace the leg award's elapsed-time completion signal with validated native
completion of that cycle's own flight animation. Preserve its 1.5/1.8-second
CSS durations, descriptor/cycle dedupe, cancellation and identity resets,
geometry, financial authority and per-client progression. A cancellation or
child decoration animation must not impersonate successful completion. No
extra fixed delay or wait for the other player's animation is indicated.

Add actual-renderer tests covering normal and delayed rendering, winning and
ordinary legs, one completion per generation, cancellation, and subsequent
identities. Keep strict full-duration evidence; do not loosen the observer
merely to get a passing campaign. Then repeat the full published winner,
payout and Run Back check with guarded fake-money cleanup. Investigate any
remaining sweep/pot evidence gap on its own exact owner before changing it.

The preserved production captures do not contain the native animation's
currentTime at removal, so this local proof is not presented as a retrospective
measurement of their exact missing milliseconds. It establishes a concrete
reachable defect in the same completion owner. Correction awaits approval.
