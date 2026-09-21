# Farkle notice payload correction

The approved correction changes only `FarkleGameTable`'s gameplay-notice payload
from `text` to `title`. HOT DICE and FARKLE use the existing canonical renderer,
semantic IDs, scopes, dedupe, queue behavior and 1600 ms TTL. No shared renderer,
existing-game producer, authority, migration or production setting changes.

Focused component coverage renders both notices from the actual Farkle producer
through the unchanged canonical renderer and verifies duplicate snapshots do not
emit again. The actual-client proof uses normal server Roll/Hold actions with
TEST ONLY scoring in the isolated database. It samples visible canonical rail
nodes before the action and through expiry on both desktop and mobile clients.

The focused browser proof passed in 35.7 seconds:

| Notice | Peer visible duration | Actor visible duration |
| --- | --- | --- |
| HOT DICE | 1619 ms | 1627 ms |
| FARKLE | 1599 ms | 1596 ms |

Each captured event contains `payload.title`, uses the unchanged 1600 ms TTL,
and produces a non-null element from the actual canonical renderer. Visibility
checks include layout bounds and CSS visibility/opacity, not text presence alone.
The proof admits animation-frame sampling variance around the fixed TTL.

Tests: `src/components/farkle/FarkleNotices.test.tsx` and
`e2e/farkle/notices.local.spec.ts`. The initial component run needed its missing
jest-dom matcher import; after that test-environment correction, both cases passed.

This focused correction is not full Wave 2 qualification. Remaining Farkle cases,
the seven-game browser campaign, exact-source deterministic checks, production
metadata verification and final cleanup must still be green before qualification.
Main integration remains held. Production creation stays disabled, admin-only
enabled and scoring defaults unapproved/unseeded.

Pre-commit validation passes: 1,659 application tests, 226 harness tests, typecheck
and production build. Source hashes and focused browser evidence are recorded in
`supabase/farkle/wave2-qualification/20260921-notice-fix/`.
