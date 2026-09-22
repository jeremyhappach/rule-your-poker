# Approved Farkle defaults and admin-only release

Jeremy explicitly approved the production scoring/defaults and the isolated
integer-serialization correction on September 21, 2026. Migration
`20260922024443_farkle_approved_production_defaults` is applied.

The resolver's sole behavior correction wraps the existing milliseconds value
in `trim_scale`. Thus `2000.0` becomes `2000` without rounding. Existing frozen
configuration validation, identity checks, TEST ONLY restrictions, immutable
snapshots, Run Back, owners/grants and shared functions remain unchanged.

The seed uses the existing Farkle creation/recovery serialization lock. Target
is 10,000; endgame Equal Turns; Balanced bot bank threshold 500; entry has no
minimum and repeated-Farkle penalties remain unsupported. Singles 1/5 are
100/50; triples are 1000/200/300/400/500/600; four/five/six kind are
1000/2000/3000; straight/three pairs/two triplets/four plus pair are
1500/1500/2500/1500. Highest interpretation and per-roll combinations are
unchanged: four 1s score 1100. Stake and timings inherit the existing schema
defaults (1 chip, 10 seconds, 2-second bot delay); no other defaults change.

Creation=true, production_defaults_approved=true, admin_only=true. This is an
admin playtest release, not public enablement. The client loads server defaults
and submits only dealer choices. The previous unsaved draft display now shows
approved server rules, and admin Run Back uses the existing frozen snapshot.

Pre/post-apply proofs pass 45 focused assertions. They cover exact delays
0.1/2.0/2.5/99.9 seconds, every approved kind/combo score, immutable configuration,
non-admin setup rejection, idempotent setup, Run Back, per-roll scoring and no
entry minimum. Candidate → restoration → candidate preserves all function
metadata; only the approved resolver fingerprint changes. Fixtures roll back.
49 focused client/setup tests, TypeScript and Vite build pass. The first local
helper test/typecheck exposed missing mocking/generated-column typing; both
were corrected and the affected checks rerun successfully.

See `supabase/farkle/production-defaults/` for deployed capture, proof, results
and executable `restore-resolver.sql`. Forward recovery disables creation under
the existing lock and restores the exact resolver without deleting defaults or
frozen history. No historical migration was rewritten.

Normal main publication and the two-admin fake-money production smoke follow
these gates; the final deployment/manifest, browser actions and fixture cleanup
are recorded in the post-release evidence. No exhaustive Wave 1/2 campaign is
required for this scoped correction.
