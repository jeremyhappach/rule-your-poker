# Mega Card Golf V1 production release

Jeremy authorized scoped migration, branch/main integration and push, matching
deployment, and activation after qualification. All three courses were enabled at
2026-10-23 15:16:03 UTC. Owner production smoke remains pending.
The final release tag is `mega-card-golf-v1-live-20261023`.

## Publication and installed identities

- Verified client/API SHA at activation:
  `77ae80ad46793e7d80ae6eb89df6c776af85cf1c`.
- Vercel READY deployment `dpl_6LE1atBeNL2A7bKAewMHQTriqmxX`,
  `https://ptown-poker-cdme9axw2-jeremy-8e2b.vercel.app`; public alias
  `https://holm357.com/arcade/mega-card-golf` had an exact build manifest.
- GitHub `Publish release signal` passed, run `39970181746`; the persisted
  `release_publication` setting matched the exact SHA before activation.
- Recovery worker `arcade-recovery` v13 ACTIVE, existing JWT policy preserved;
  worker identity `899ae7d5-5e13-4fe7-a146-3a0001b00023`.
- Hosted base migration `20261023141036` (`mega_card_golf_v1`), from local file
  `20261023135206_mega_card_golf_v1.sql`, SHA-256
  `ca77436a823c245ce9693c5d7ef9cf081cf13a421635bacd45d52d7cbac37807`.
- Hosted score-facts migration `20261023150632`, local file
  `20261023150143_mega_card_golf_low_score_facts.sql`.
- Hosted qualification cleanup `20261023151456`, local file
  `20261023151259_mega_card_golf_qualification_cleanup.sql`.

The later source checkpoint records these installed migrations and evidence;
client/API/worker source is unchanged from the verified 77ae80ad4 deployment.
Its final exact SHA, deployment and release-signal verification are reported at
delivery and discoverable through the release tag and public build manifest.

## Qualification evidence

Evidence files below are in `dev/mega-card-golf/evidence/`.

- `hosted-baseline.json`, `hosted-candidate.json`, `hosted-installed.json`:
  actual hosted definitions/indexes and candidate/installed rollback proofs.
  Canonical negative scores, ties, authentication/grants, atomic injected failure,
  duplicate/replay/late replay, continuation/terminal, frozen history/configuration
  and explicit course archival pass. Arcade row hashes match after rollback.
- `release-races.json`: independent PostgreSQL connections prove final action
  versus recovery, late-action deadline precedence, and both course-edit/admission
  orderings. These contention tests ran locally against installed authority.
- `worker-preservation.json`: original main's bundle matches deployed v10;
  only the Mega reducer/dispatcher enters the updated worker. Edge deployment uses
  neutral bundling with external `node:crypto`; no dependencies were installed.
- `hosted-browser.json`: actual hosted bearer authentication, unauthorized and
  other-owner denial, direct RPC refusal, second-tab Realtime, authenticated reload,
  complete nine-hole production play, course board and no browser runtime errors.
- `low-score-candidate.json`, `low-score-installed.json`: an existing high-score
  trigger initially overwrote Mega's low-score record metadata. The forward fix
  excludes only Mega, preserving its authoritative course/board facts. First,
  matched, higher and broken records pass; all seven other Arcade games retain
  their exact existing trigger behavior. Every proof fixture rolled back.
- `worker-restart.json`: a persisted active revision-zero run was held with a
  future due time, worker v13 was deployed, then only that fixture was released.
  With zero clients or state API requests, the worker finished all nine untouched
  holes using actual cards, creating one result at 15:10:55 UTC. The earlier
  zero-client fixture finished before v12 deployment and is not restart evidence.
- `fixture-cleanup.json`: exactly three recorded fixture fingerprints were removed
  in one guarded migration. The result immutability trigger was restored within
  the same transaction; unrelated Arcade rows, rules, course configs and boards
  retain matching hashes. No multiplayer or financial table was written.
- `activation.json`, `activation-browser.json`, `production-courses.png`: only
  `mega-card-golf/1` admission changed. Three approved courses and their original
  board IDs remain intact; authenticated API and three enabled Start buttons pass.
- `security-review.json`: two INFO-only private RLS/no-policy findings are intended
  deny-by-default behavior, supported by direct-grant denial proofs.

135 focused Mega/Arcade/catalog/Golf checks, TypeScript and application build pass.
Local proof additionally guarded 143 non-Arcade tables, including financial and
multiplayer state. Local browser evidence retains full-course, Defaults/archive
and mobile/landscape coverage. Shared shell, multiplayer rules and other games'
admission flags are unchanged. The unrelated Cribbage snapshot edit on main is
preserved and excluded from this release.

## Owner smoke

Open Arcade → Mega Card Golf. Inspect the three course landscapes, choose two
opening cards, draw/replace/discard, reload and complete a course. Confirm the
course-specific low-score board. Check that the final stock draw finishes before
scoring. A five-minute untouched hole reveals and scores its actual cards without
a penalty. Sunny uses the revised landscape; Coastal/Canyon art is unchanged.
Jeremy's production smoke is separate from automated qualification.
