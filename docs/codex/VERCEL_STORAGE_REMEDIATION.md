# Vercel storage remediation — November 9, 2026

Local candidate on `codex/vercel-storage-remediation`, based on production
`97372c3b025d4b5b59b82bcaf617e0fb10f425f4`. Nothing was deployed or deleted.
No account settings, aliases, billing, protection, retention or Supabase data changed.
No dependencies or tools were installed.

## A. Capacity cleanup awaiting explicit approval

The [exact 27-deployment proposal](VERCEL_STORAGE_DELETION_PROPOSAL.md) contains
IDs, Chicago/UTC dates, full commit SHAs, branches, alias/protection/retention
status and byte estimates. The selected public directories total 1,782,548,722
bytes (1.783 GB), excluding compiled output and function bundles. Against the
reported 10.24 GB team total, this corresponds to approximately 1.54 GB headroom
if credited at those sizes; account usage must verify the actual recovery.

All 128 latest READY branch previews and all aliased deployments are retained,
along with current production, the preceding rollback candidate, gameplay-tested
`79d113de`, the latest five production builds and daily production checkpoints
from November 1 onward. Exact saved retention periods and per-deployment bypass
overrides remain unavailable. Refresh identities/aliases again before any
approved cleanup. Do not infer deletion authorization from this branch.

## B. Implemented local optimization

| Measurement | Before bytes | After bytes | Saved bytes |
|---|---:|---:|---:|
| Full static output | 103,498,912 | 82,658,138 | **20,840,774 (20.136%)** |
| Image files | 96,406,244 | 75,565,470 | 20,840,774 |
| Audio | 1,636,446 | 1,636,446 | 0 |
| JavaScript | 4,305,478 | 4,305,478 | 0 |
| CSS | 430,169 | 430,169 | 0 |
| Video | 709,853 | 709,853 | 0 |
| Other | 10,722 | 10,722 | 0 |

Both builds contain 171 files. These are uncompressed local static file sizes,
not Vercel account measurements; function bundles are excluded. Both builds used
the same checked-out application source and installed dependencies. Generated
release timestamps change hashes but not the measured JavaScript size.
Measurements preceded the local commit, so their build manifests record the
base SHA; they are size evidence, not publication receipts.

The 24 startup PNGs shrink from 52,661,044 to 33,484,287 bytes, saving 19,176,757.
The 14 Arcade PNGs shrink from 28,263,423 to 26,599,406 bytes, saving 1,664,017;
ten improve and four already-compressed originals remain unchanged.

The offline PNG encoder optimizes row filters and DEFLATE compression, coalesces
IDAT chunks, and removes an alpha channel only when every pixel is opaque and no
ancillary metadata complicates that change. It retains the original whenever
re-encoding would grow the file. It never quantizes, resizes, recolors or drops
real transparency; ancillary metadata is retained byte-for-byte. All 38 input
images have exact decoded RGBA proofs and an independent native-browser decode
comparison against the production Git originals. All changed-channel counts are zero.

All 24 startup images retain their PNG format, names, resolutions, orientation
media queries and exact pixels. The startup generator now applies the same
lossless optimization to future exports. Arcade PNG artwork uses the same
lossless treatment; existing WebP assets remain intact. No WebP/AVIF conversion
was needed, so there is no new decoder requirement or URL migration.

The earlier audit's 45–65 MB savings estimate depended on more aggressive
encoding/removal. This implementation takes the measured, pixel-identical
20.84 MB saving instead of claiming that forecast was achieved. At 84 deployments,
the saving represents approximately 1.75 GB less raw static output accumulation.

## Compatibility and obsolete assets

No public assets were deleted. All 108 prior public URLs still exist. Static
references, dynamic lobby tile paths, manifests, splash code and the push worker
were inspected. The worker is push-only and has no application fetch cache, but
installed icons, retained HTML/JavaScript and older open clients can still refer
to older URLs. Old icon/Arcade variants therefore remain compatibility assets.

Externally managed Arcade artwork uses Supabase bucket object paths. The source
contract was inspected; live persisted rows were deliberately not queried.
Absence of an external reference cannot be proved from this no-Supabase scope.
Retire the earlier 7.55 MB candidate set only after an explicit compatibility
window and reference review. Never remove a file merely because a literal grep
misses a dynamically constructed path.

API and server files, all gameplay sound assets, push worker, PWA manifest,
approved splash video/opening/poster and release publication workflow remain
byte-identical. `vercel.json` routes and function settings remain identical,
including Run21 `cle1`. Only the build command gains a post-build size check.

## Reproducible size reporting

```sh
npm run report:build-size
node scripts/build-size-report.mjs dist --json .storage-audit/current.json
node scripts/build-size-report.mjs dist --compare .storage-audit/before.json
npm run optimize:png -- --report .storage-audit/png-dry-run.json
npm run optimize:png -- --write --report .storage-audit/png-write.json
npm run test:storage
node scripts/storage/verify-browser.mjs
```

Reporting includes total bytes, file counts, categories, extensions, top-level
directories, twenty largest files and file SHA-256s. Missing build identities or
output fail rather than producing a false zero-byte success. The existing local
and Vercel build commands retain their checks and add a **90,000,000-byte static
budget** after bundling, leaving about 7.34 MB growth room above this candidate.
The reporter adds no deployed JavaScript or runtime dependency.

The preservation/pixel proof commands are qualification checks for this candidate;
their baseline hashes deliberately do not replace normal future gameplay tests.

## Deployment-frequency evaluation — not enabled

1. A narrow documentation-only skip can avoid runtime-identical rebuilds, but
   must be introduced together with a shared decision in
   `.github/workflows/publish-release.yml`. That workflow currently requires the
   pushed SHA to appear in the live build manifest before publishing a release.
   Skipping only Vercel would leave it waiting for a deployment that cannot exist.
2. Compare the full change range to the last successful relevant deployment,
   not only `HEAD^`: a multi-commit push can end in documentation while containing
   earlier product changes. Missing/shallow history, unknown paths or ambiguous
   state must continue building. Do not exclude migrations, runtime assets,
   functions, dependency/config files, test infrastructure or executable evidence
   runners merely because they do not look like UI code.
3. An approved docs-only decision should skip publication, not fabricate a new
   release identity or write a release signal for an unbuilt SHA. Qualification
   and review checks must still run. Start with a non-skipping diagnostic period,
   then enable only after baseline coverage is reviewed.
4. Preview/production pairs are often intentional qualification. Keep required
   previews; batch documentation and intermediate branch pushes, and publish
   one preview when a candidate is ready. Do not blanket-disable previews or
   change the mandatory task-branch workflow.

Vercel's [Ignored Build Step](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel)
uses exit 0 to skip and a nonzero exit to build. Skipped builds are still canceled
deployment records; this avoids output accumulation, not all deployment quota
usage. No ignore command, webhook, workflow trigger or project policy changed in
this candidate. Frequency enforcement is a separate coordinated workflow change.

## Validation and release blockers

- TypeScript: passed as the first stage of `npm run build`.
- Vite production builds: before and after passed; 90 MB budget passed.
- Storage tooling: six tests passed, including corrupted-image rejection and
  budget failure behavior.
- Asset qualification: 38 RGBA proofs, 24 startup resolutions, 58 literal artwork
  references, 14 dynamic tiles, 108 retained URLs and 80 unchanged files passed.
- Independent installed Edge/Chromium: all 38 images decoded with zero changed
  pixel channels. All network requests were blocked; no backend was contacted.
- Focused splash/release tests: 26/26 passed.
- Full application run: 3,974 passed, 15 failed across six files, with three
  unhandled errors. The identical 15 cases fail against untouched production
  commit `97372c3b` in the existing clean `main` worktree (16 other cases pass).
  Failures involve stale Mega configuration mocks, catalog/defaults expectations,
  Arcade ordering/catalog changes and the card-renderer allowlist. No such source
  or test was modified here.

**The full `npm run build` release gate is not green.** It stops at the pre-existing
unit failures; the separate Vite build is measurement evidence, not a waiver.
No tests were skipped, weakened or silently corrected outside storage scope.
Resolve or explicitly scope those failures through the normal workflow before
release. The harness stage after the failed app suite was not reached.

Physical iPhone checks before production acceptance: existing installed PWA and
fresh install; cold Home Screen launch in portrait/landscape; the opening-frame
handoff and approved video; reduced-motion behavior; cached/resumed app; push-tap
entry to an existing match; Arcade tiles/backgrounds/transparent portraits at
normal and zoomed display sizes. Desktop decoding does not prove native iOS
startup-image selection or installed-client cache behavior.

## Evidence

- [Before build](evidence/storage-build-before-20261109.json)
- [After build and comparison](evidence/storage-build-after-20261109.json)
- [PNG byte/pixel proof](evidence/storage-png-proof-20261109.json)
- [Independent browser proof](evidence/storage-browser-pixels-20261109.json)
- [Preservation contract](evidence/storage-preserve-20261109.json)
- [Validation and reproduced baseline failures](evidence/storage-validation-20261109.json)
- [Exact deletion proposal](evidence/storage-deletion-proposal-20261109.json)

Deployment deletion and branch publication each remain pending Jeremy's explicit
approval. Do not push this branch: Git integration would create a preview.
