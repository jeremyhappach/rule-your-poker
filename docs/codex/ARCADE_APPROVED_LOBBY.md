# Approved Arcade lobby — 2026-11-01

Jeremy explicitly authorized implementation and production publication of the
nine supplied designs in `PTown_Arcade_Approved_Design_Package.zip`.
The cropped assets and full-lobby screenshot are the visual reference; no new
artwork was generated. Work is isolated from the original dirty Golf checkout.

`ArcadeSwitchboard` retains catalog order, eligibility, navigation, artwork
administration and the existing Rules owner. `ArcadeTile` renders the approved
1466:564 banners through `tileArtwork.ts`. Future catalog games use the same
component with a text/upload fallback until approved artwork is configured.
All game entry routes still open their existing leaderboard/start surface.
Rules, scoring, clocks, finances, records and gameplay are unchanged.

Each tile contains a native link and a sibling Radix Dialog trigger, with one
accessible Rules button and no nested interactive elements. All nine targets
share the same bottom-right sizing and placement (at least 44×44 CSS px). The
opaque gold circle covers the illustrated control. Run21's higher illustrated
circle is accounted for only in the visual face offset; its hit area remains
aligned and contains the complete face. Other Rules buttons retain their styling.
Existing dialog focus trapping, Escape and focus return are preserved.

The approved set supersedes uploads predating 2026-11-01 18:30 UTC. Subsequent
admin replacements still take precedence through the existing Storage flow;
no database or Storage rows were changed. Asset defaults are immediately usable
while the existing artwork metadata request is pending or unavailable.

Delivery uses uncropped 480px/960px WebP at quality 92, selected with `srcset`.
The 480px set totals 348,784 bytes; both sets total 1,354,450 bytes, compared with
11,095,444 bytes of source PNGs. Reproduction:
`dev/arcade-lobby/optimize-assets.py <extracted-package-directory>` (Pillow).

Qualification passed:

- Application TypeScript (`npm run typecheck`). The optional `tsgo` binary is
  not installed; no tools or dependencies were installed.
- 32 focused tests across ArcadeTile, ArcadeSwitchboard and the game catalog.
- Production Vite build, with existing bundle-size/Browserslist warnings.
- 25 browser groups in installed Edge, with touch emulation and 3× DPR:
  320×568, 360×800, 375×667, 390×844, 393×852, 430×932, 568×320,
  844×390, 768×1024, 1024×768, 1280×800 and 1920×1080.
- All nine images decoded, native aspect ratios, two columns, no horizontal
  overflow, ≥44px targets and visible faces inside their targets.
- All nine actual Rules renderers, independent tap/Enter/Space actions,
  Escape/Close focus return, sequential keyboard navigation and original links.
- 200% root text sizing and forced-colors checks; zero browser page errors.

Browser qualification uses actual production components with local read-only
adapters. It does not start production runs or modify customer data. Runner and
results: `dev/arcade-lobby/browser.mjs`, `dev/arcade-lobby/evidence/results.json`.
Representative 320px, 390px and desktop screenshots are retained beside results.
The browser runner waits for image decoding and painting before screenshots.

Physical-iPhone production smoke remains Jeremy's acceptance gate:

1. Open Arcade in Safari/PWA and confirm all nine approved banners and order.
2. Tap every gold info button; confirm the matching Rules open without launching.
3. Close Rules, tap the artwork, and confirm the original game entry/Play flow.
4. Check portrait, landscape and scrolling for clipping or excess spacing.
5. Return to Arcade/Main Lobby; verify leaderboard and game behavior are unchanged.

Release checkpoint: `arcade-approved-lobby-20261101`. Exact commit/deployment
identity is reported after the normal main push and Vercel verification.
