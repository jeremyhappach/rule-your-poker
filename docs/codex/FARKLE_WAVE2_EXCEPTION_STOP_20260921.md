# Wave 2 qualification exception — stopped on first failure

Tested source: `bb7ba16b52972043b1ed5a487b336bf1fb21b8a7`.

The first remaining browser case failed its remote presentation assertion at
`runtime-farkle.local/wave2-remaining.spec.ts:89`. It expected observed peer phases
`cluster`, `rumble`, `reveal`, `row`; the recorded phase list was only `row`.

The campaign stopped immediately with one attempt and no retries. No diagnosis,
debugging, harness repair, product change, migration, production mutation or main
integration followed the failure. This observation does not establish whether
the cause is product presentation or qualification/observer attribution.

The seven-game browser campaign was not started. Remaining Farkle cases and final
production metadata verification were not executed after the stop. Wave 2 remains
unqualified; the prior four focused passes do not waive this failure.

The failed game's cleanup completed. Local synthetic users/profiles, gameplay,
transfer records, creation receipts and telemetry are gone; only the pre-existing
three release/timer controls and seven existing-game defaults remain. Local
creation is disabled. All 384 functions still match the recorded applied metadata.
Local client and scheduler processes are stopped. Production settings were not
changed; production defaults were neither approved nor seeded.

Evidence: `supabase/farkle/wave2-qualification/20260921-bb7ba16b5/` contains the
stop manifest, exact qualification case/configuration, screenshots and existing
failure context. The original trace hash is recorded; raw traces are excluded from
published evidence because they may contain test credentials. The resumed run reused
the ignored local trace output path after the original failure was diagnosed.

The authorized follow-up established a proof defect and corrected it without
product changes. See [timestamped diagnosis and subsequent qualification stop](FARKLE_PEER_ANIMATION_PROOF_20260921.md).
