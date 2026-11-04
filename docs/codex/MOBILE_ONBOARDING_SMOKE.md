# Mobile onboarding smoke fixes — 2026-11-04

Jeremy approved one release for the six reported tutorial/header findings.
Base: `4daaaf987`. No schema, account decision, notification preference, service
worker, gameplay or financial mutation is included.

## Confirmed failure boundaries

- Jeremy used iPhone Chrome, refreshed when the current-build gate required it,
  then signed in for the first time. Entry capture rejected every `reload`;
  `SIGNED_IN` only recaptured after an explicit `SIGNED_OUT`. The actual
  Auth/AccountAccessGate/Index browser fixture reproduced zero onboarding calls
  after that sequence. Mobile detection itself recognized Chrome correctly.
- Optional push registration/reconciliation failures could leave `pushReady`
  false indefinitely. A temporary startup blocker could also discard an
  eligibility response after its entry had already been consumed.
- In the published CSS, the shared `.grid` utility followed and overrode the
  tutorial's flex declaration. Expanded instructions pushed Done below y=680
  on a 568px viewport. The old fixture loaded CSS in reverse order and defined
  the push feature flag as boolean `true` instead of the production string.
  Those qualification errors are corrected, not treated as acceptance proof.
- Read-only production inspection found zero saved onboarding decisions and no
  recoverable lobby memberships at investigation time. No preferences were reset.

## Correction and preservation

- Fresh supported lobby/auth documents may qualify after a build reload. A
  version/account-scoped sessionStorage presentation receipt prevents repeated
  display on same-tab reloads. It is not preference authority: the existing
  account RPC still determines completion, dismissal and seven-day snooze.
  Desktop and standalone never consume automatic eligibility. Game/deep-link,
  recovery, history navigation, visibility and reminder guards remain in place.
- Admission retains one pending result across temporary startup blockers and
  consumes the entry only when presentation is admitted. Push destination
  resolution still precedes onboarding; optional maintenance failures cannot
  strand it. No polling or arbitrary transition timer was added.
- The lobby keeps username/balance, bell and profile visible. One accessible
  overflow menu owns History, Help (tutorial and rules), and Login/Logout.
  Existing handlers are reused. Bell route visibility and gameplay sound
  controls are unchanged.
- Slide 1 explains three installation benefits before instructions. A seven-
  second CSS sequence shows Safari/Chrome, the menu, installation confirmation
  and the real P-Town Poker Home Screen icon. It pauses off-slide, when hidden,
  and through a player pause control; reduced motion shows a static final frame.
- Tutorial-specific CSS wins the production cascade. A dynamic-viewport and
  safe-area bound contains fixed header/platform/footer controls and a flexible
  vertical scroll area. Spacing stays compact when text is enlarged; swipe,
  details expansion and all exit controls remain available.
- Slide 2 clearly marks notifications optional and explains Settings and Quiet
  Hours. Its read-only example always shows ordinary player controls.

## Qualification and release

101 focused tests, 241 harness tests, 34 browser scenarios, App TypeScript and
the production bundle pass. The 34 browser scenarios include both platform
sequences, reduced motion, vertical touch scrolling, expanded/collapsed help,
320/360/390/430/844/1280 widths and 200% text. The prior ten unrelated Mega
suite failures are documented in the original release and were not rerun or
modified as part of this scoped correction.

Focused tests include entry receipts, reported refresh/first-login reproduction,
desktop-first use, push failures, overlay races, reminder/Settings behavior,
lobby bell route restrictions and unchanged sound controls. Browser qualification
uses the actual Auth/Index/AccountAccessGate/GameLobby/tutorial/Settings components
with an explicitly mocked backend and device services, and the exact built CSS.
`dev/mobile-onboarding/browser.mjs` also accepts `ONBOARDING_HOSTED_URL` to verify
against the published stylesheet. Structured evidence is beside that script;
screenshots and detailed logs are under ignored `qualification.local/mobile-onboarding/`.

Publication receipt belongs to `release-mobile-onboarding-smoke-20261104-verified`.
Physical iPhone/Android browser chrome/safe areas, touch installation, OS prompts,
previously denied permissions and actual push delivery remain Jeremy's smoke.
The automated fixture is not a claim of physical-device or real-account production
acceptance. Owner smoke starts with iPhone Chrome → current-build refresh → login.
