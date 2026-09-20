# Card-face test timing investigation

The unchanged `cardFaceContract.test.ts:16` test passes at authority commit
`e80200300ee81597f8ac11447a2aa15069107644` in a fresh worktree.

- Focused isolation: 548.6263 ms, exact test passes with its original 15 s limit.
- Complete application rerun, without a concurrent browser campaign: all 1,639
  tests pass. The two-test card-face file completes in 3,304 ms.
- All 226 harness tests, typecheck and production build pass in the same run.
- The required 41-file/282-test regression selection is fully covered by that
  successful complete application run, verified file by file.

The failed run overlapped the complete build/test suite with the two-browser
qualification campaign. Its card-face test took 18,327 ms and exceeded 15 s.
The focused test, its `src/**/*.tsx` inputs, dependencies and runner configuration
are identical to the permanent pre-Farkle checkpoint. The test synchronously
reads/parses TSX and does not read Farkle SQL or query the database. The matching
renderer-owner assertion passes unchanged.

Classification: a timing failure under concurrent test-runner/browser load,
consistent with resource contention; no deterministic Wave 1 regression or
card-face product defect is demonstrated. Original host resource telemetry was
not captured, so CPU scheduling, memory pressure and filesystem contention
cannot be separated retrospectively. Serializing qualification removes the
observed competing workload; no timeout increase, exclusion or retry is used
to turn the failed run into a pass.

The failed run remains failed. This new full application run and a completely
fresh 21-case browser campaign form the new post-apply qualification. The old
13 completed browser cases do not contribute to it.

The original generated snapshot newline change and Supabase CLI version cache
are untouched and excluded from commits. The new worktree started at the exact
published/applied source commit; dependencies reuse the existing installation.
No repository permission or cleanup policy was changed.
