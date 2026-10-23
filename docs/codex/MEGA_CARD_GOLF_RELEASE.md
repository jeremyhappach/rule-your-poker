# Mega Card Golf V1 approved release

Jeremy authorized scoped migration, normal branch/main integration and push,
matching deployment, and activation after required qualification. The dedicated
worktree and `codex/mega-card-golf-v1` branch are retained. No other workstream is
included. Existing remote/main and Vercel production SHA are
`df48d4b73892e6965aafadb9768011af0e1906a3`, with no reconciliation delta.

## Prepared and qualified

- CLI-created forward migration:
  `supabase/migrations/20261023135206_mega_card_golf_v1.sql`.
  SHA-256 `ca77436a823c245ce9693c5d7ef9cf081cf13a421635bacd45d52d7cbac37807`.
  Guards installed Arcade/Golf definitions; new admission remains false.
- `dev/mega-card-golf/evidence/hosted-baseline.json`: actual hosted definitions,
  exact unfinished/result/receipt indexes and constraints, healthy recovery.
- `hosted-candidate.json`: actual hosted rollback proof passes negative canonical
  scores, ownership/admin grants, atomic injected failure, winner/ties,
  duplicate/replay/late replay, continuation/terminal, immutable config/history and
  course archival. Full Arcade row hashes agree after rollback. Initial fixture
  corrections selected a non-admin explicitly and required the admin to have an
  actual Auth user; no product authorization was weakened.
- `release-races.json`: independent local PostgreSQL connections prove final action
  versus recovery, deadline winning over a late action, and both orderings of
  course edit versus admission with frozen configuration.
- `worker-preservation.json`: bundling the existing main recovery owner produces
  exactly hosted worker v10, excluding trailing newline normalization. Only the
  Mega dispatcher/reducer additions enter the new worker.
- TypeScript, application build and focused Mega/Arcade/catalog/Golf regressions
  pass. Original local nine-hole browser, reload, owner refusal and explicit
  retain/archive proofs remain in `backend-browser.json` and screenshots.

The client now subscribes to the existing private-by-owner `arcade_revisions`
transport. Busy requests queue a revision refresh. Recovery suppresses stale
audio while live transitions retain their cue. Embedded course Defaults imports
its own scoped styling. No shared shell or multiplayer rule was changed.

## Publication checkpoints still required

Apply only this reviewed migration with admission closed; run installed proof.
Deploy the corresponding client/API and worker; verify the exact public manifest,
READY deployment, GitHub release signal, fresh authenticated owner/other-owner
behavior, Realtime/reconnect, zero-client recovery and worker restart. Qualified
synthetic data must be isolated and cleaned without touching existing boards or
financial/session records. Activate only `mega-card-golf/1` and the three approved
courses after these checks pass. Record actual identifiers and evidence here.

Owner smoke after activation: Arcade → Mega Card Golf; inspect all three course
landscapes (Sunny revised; Coastal/Canyon unchanged), choose two opening cards,
draw/replace/discard, reload, finish a course and confirm the course-specific low
score board. Check the final draw resolves before scoring. A five-minute untouched
hole reveals and counts its real cards without a penalty. Owner smoke is separate
from automated qualification and is never performed on Jeremy's behalf.
