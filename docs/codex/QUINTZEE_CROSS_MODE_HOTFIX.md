# Quintzee cross-mode layout hotfix — November 10, 2026

The production polish at e5f4febe62933a62437abadb2241704cce882d6f used a
660px board-height breakpoint that replaced the approved controls with a compact
variant: 28px primary actions, 8px HOLD labels and 13px bonuses. Async's match
header and the live shell consumed height, crossing that breakpoint sooner than
Arcade. Its size-contained dice lane also changed the meaning of container-height
units. Existing geometry checks covered category selectors but omitted minimum
action and dice dimensions.

Jeremy explicitly rejected scrolling during this hotfix. The final approach
reclaims the empty canonical announcement rail only while empty, reduces surrounding
header padding and game gaps, and sizes the play lane to its content. Short
containers place cumulative scores beside timing. All modes keep one shared view,
two category columns, staggered selectors, existing canonical safe-area padding,
dice artwork and animation. Primary and zero-confirmation actions have 64px minimum
height; the held outline no longer changes dice geometry.

## Scope and qualification

Product files: src/components/quintzee/quintzee.css and QuintzeeView.tsx (only the
zero-confirmation footer's scoped class). No rules, transport, state, RNG, scoring,
settlement, authentication, notification, splash, deployment configuration or
database changes.

The rendered regression runner is dev/quintzee-layout/browser.mjs. It mounts the
actual QuintzeeView and FullscreenGameShell with controlled snapshots and the
Arcade, Async, and canonical live outer layout contracts. All network access except
loopback is blocked. Tests cover 375×667, 375×812, 390×844, 393×852 and 430×932,
including model-specific resolved safe-area padding (20/0, 44/34, 47/34 or 59/34).
Browser emulation does not reproduce physical iPhone WebKit or native env() values.

Checks require every gameplay control visible at once, no document or gameplay
scrolling, 64px primary/confirmation targets, 48px category selectors, square dice
with at least 44px touch width, readable single-line bonuses, no overlaps or
obstructed targets, and no clipping of category labels or score/chip rows.
State coverage includes ready/start, rolled/hold/release, pending, zero rerolls,
category completion, zero confirmation, and next-round identity/held reset.
Existing rule, audio and presentation tests are also run.

The production release gate is unchanged: npm run build invokes production-push
qualification, TypeScript, full app/harness/tooling tests, build and the 90MB budget.
The hosted stylesheet can be rerun through the same measured fixtures using
QUINTZEE_HOSTED_URL. That is published-CSS evidence with fixture state, not proof
of authenticated human gameplay or financial settlement.

## Status

All 15 rendered cases pass, including held/released dice, a reroll with stationary
held dice, pending/disabled actions, zero rerolls, category recording, zero
confirmation and next-round reset. At 393×852 every mode has a 366.2×64px primary
target, 64.5×86.7px dice targets and 16px bonus text. The five tested portrait sizes
show all controls at once without scrolling, overlap or clipping. Screenshots
were inspected for all three modes, including zero rerolls and the compact live
score/chip/timer arrangement. 63 focused Quintzee tests pass.

Final production-push gate PASS after the score-row correction: TypeScript,
4,027 application tests, 241 harness tests, 46 release-tooling tests and build.
Static output is 89,480,738 bytes / 179 files, below the unchanged 90MB limit.
No failed tests or unhandled errors. Publication and hosted verification follow
the normal main push; no extra preview, schema migration or gate modification.
Current production baseline: e5f4febe62933a62437abadb2241704cce882d6f,
READY deployment dpl_8PYREgNzZmGxS5UrVqF4ZQME9GYJ.
Physical iPhone smoke of Arcade, Async and multiplayer remains Jeremy's acceptance.
