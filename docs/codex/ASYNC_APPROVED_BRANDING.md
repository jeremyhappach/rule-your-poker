# Approved async match branding — 2026-11-01 — local review, publication HELD

Jeremy authorized implementation from `PTown_Async_Branded_Headers_Design_Package.zip`
and explicitly withheld integration/publication until his later approval. The
comparison board is reference only; the live layout remains one vertical column.

Dedicated branch/worktree: `codex/async-approved-branding`, based on released
Arcade commit `dd6a8b5b8`. No original/Arcade worktree, Arcade assets or source
files were changed. No branch push, integration, deployment or schema action is
part of this checkpoint. The earlier Arcade work is complete, but that does not
waive the explicit approval requirement for this async candidate.

## Implementation and preservation

`AsyncGameHeader.tsx` replaces only the existing child-card header in `Delayed.tsx`.
Its native heading preserves ordinal/title accessibility; artwork is decorative,
with visible text before loading, after failure, and in forced-colors mode. Stakes
remain React-rendered live data. The header adds no buttons or links.

`src/lib/delayed/gameBranding.ts` maps the ten canonical game IDs to theme and
artwork. Existing five-game eligibility, invitation/capability configuration and
transport types are unchanged. The five extra entries prepare branding only.
Unrecognized titles retain a text fallback; prepared future games resolve their
human-readable fallback from the canonical catalog.

Assets are isolated at `public/game-branding/async-v1/`. Nine logos and quiet
motifs are deterministic crops/masks of the high-resolution supplied originals;
the illustrated rules badge and its shadow are excluded. No mockup screenshot
crop is shipped as a production image. Words uses native serif text and decorative
CSS letter tiles, as the handoff directs. Derivatives total 768,024 bytes across
all nine raster brands; unused future assets are not requested by the live list.
Source SHA-256 values/crop bounds are in `dev/async-branding/asset-provenance.json`.
Reproduce with bundled Pillow:
`derive-assets.py <extracted-async-design-package>` from the repository root.

Normal card width, single-column order and 12px inter-card gaps remain intact.
Each header adds 7.61px to card height at all nine normal tested viewport sizes.
The scoreboard, pending results, financial values, turn state colors, deadlines,
Playing now, notifications and actions retain their existing owners. Green own-turn
and gold opponent-turn panels remain visually stronger than the header background.

The 200% text check exposed existing summary/notification overflow (409px content
at a 320px viewport, also reproduced without the new header). Scoped containment
and a narrow container query reflow summary labels, notification controls, stakes,
score boxes and timers. Normal layouts do not use that stacked reflow. No action,
data, timer or notification semantics changed.

## Qualification

- Application TypeScript and production Vite build pass; existing bundle-size
  and Browserslist warnings remain. No dependencies installed or changed.
- Eighty focused tests pass across header fallback/canonical IDs, live Delayed refresh and
  stale response handling, result-review/terminal continuity, preferences and
  catalog preservation.
- Thirty browser groups pass in installed Edge with touch emulation: 320×568,
  375×667, 390×844, 430×932, 667×375, 844×390, 768×1024, 1024×768, 1280×800.
- Own/opponent turn, Last Call, Resume, pending results, completed, forfeit, hold,
  expiry, invitation and Playing now states render through the actual Delayed page.
- Live fixture updates change stake, score, actor and countdown; existing keyboard
  Take Turn, touch View Results and match-finale routes remain correct.
- Long names, 200% text, forced colors and image failure fallbacks pass without
  horizontal overflow. The ten-entry branding review does not grant admission.
- Zero browser page errors or external network requests. Local fixture adapters
  model the existing transport; gameplay/result destinations are intercepted only
  after navigation. This is not hosted gameplay/financial or physical-iPhone proof.

Runner: `dev/async-branding/browser.mjs`; evidence:
`dev/async-branding/evidence/results.json` and retained screenshots.
Start `node dev/async-branding/preview.mjs` for local review on port 5194. The
fixture is loopback-only and cannot send real notifications or mutate production.

## Review and subsequent release

Review current cards at
`http://127.0.0.1:5194/delayed/00000000-0000-4000-8000-000000000003` and prepared
branding at `http://127.0.0.1:5194/brands`. Query scenarios include `?state=pending`,
`?state=completed`, `?state=forfeit`, `?long=1`.

Wait for Jeremy's explicit integration approval. Then check current `main` for
concurrent work, integrate under the normal workflow, publish the approved
candidate and verify exact deployment identity. Jeremy performs physical-iPhone
production smoke: all five brands, both turn colors, live names/stakes/scores,
countdowns, Take Turn/Resume, results/forfeit, notifications and return navigation.
