# P-Town smoke follow-up — November 8, 2026

Jeremy requested the seven fixes in `ptown-smoke-followup.zip/CODEX-HANDOFF.md`,
including exact Horses Roll 1 offers and actual banking. Leaderboard theming is
deferred. Work starts from published main `2ea15fc314ca2396b2e4949a7149ef241c686758`
in an isolated worktree; the dirty Six-Card Golf checkout remains untouched.

## Failure boundary and corrections

Production had the approved Horses /4 and Drop /5 functions/configuration
installed, but admitted Horses /3 and Drop /4. Its release-publication record
still identified `02fbb633d`. Thus new Horses games legitimately projected old
labels/payouts and omitted the /4 helper copy. All twelve Horses function
definitions match local qualification byte for byte. The activation digest's
unqualified text sort differed by database collation; explicitly sorting with
`COLLATE "C"` yields `7d0f20e0bf53bf671d6fbdd3486feef1` in both databases.
The guarded activation script now uses this stable ordering. No scoring formula,
historical run, or existing rule version is changed.

- Horses uses the server's evaluated set for its ranked label, Natty badge,
  animated offer and persisted bank. The exact above-dice copy remains:
  **Early Bank Bonus** / **Roll 1 +30% · Roll 2 +10%** / **Natty earns +20%**.
  Rules now include the exact Three 5s example.
- Accepted hold/unhold taps reuse Quintzee's quiet paired sine cues. Horses
  admits them alongside the first-offer ding, which otherwise suppressed them.
  Global mute still suppresses playback. Locked taps do not emit a cue.
- The shared tile's existing Originals membership marker selects a brighter
  two-pixel gold outline. Other Games artwork/styles and both sections' separate
  gold Rules targets are preserved.
- Voyage's dice tray has no fill, border or inset shadow. Empty slots are
  transparent with subtle outlines; ivory dice retain dark pips and soft shadows.
  Rolls Left and cargo text have tight shadows over the deck artwork.
- Both Drop carry paths toggle a selected card off. Confirm exists only for
  exactly one/two selected cards. Draft selection never submits or moves cards;
  Confirm retains the existing revisioned authoritative action.
- Drop /5 still requires three positive row scores for its single 500 award.
  ALL FILLED counts 0 to +500 during seconds 1–2, holds through second 4, then
  dismisses. The later tally starts at the prior total plus that already-presented
  bonus, so hand/time points count separately without presenting the 500 twice.
- Drop holds its completed Final Score for three seconds after its normal tally.
  Voyage holds the finished grand-total count for three seconds. Each then
  replaces the route with its own leaderboard. Final-screen navigation buttons
  are removed; replay begins from the leaderboard. Saved completed runs go
  directly there. Navigation submits no score; the existing server completion
  remains the sole result writer.

## Verification

All browser checks are **simulated**, using desktop Edge with touch and phone
viewports, actual Arcade pages, actual `arcadeOperation`, and disposable local
PostgreSQL. Deterministic randomness/decks are test-only; payout and banking
responses are not mocked. **No physical iPhone checks were run.**

| Roll 1 dice | Displayed result | Offer | Persisted bank / score delta |
|---|---|---:|---:|
| 5–6–6–5–5 | Three 5s; Natty +20% | 382 | 382 |
| 6–2–1–3–4 | Pair of 6s; no Natty | 99 | 99 |
| 2–3–4–5–6 | High card; no Natty | 33 | 33 |

`dev/ptown-polish/horses-browser.mjs` enters through the leaderboard's Play
button, presses Roll (1), checks the rendered quote/label/helper copy, presses
Bank twice rapidly and reads the actual stored hand and cumulative score.
It also checks hold/unhold/mute, rising/falling offers, mid-animation banking,
manual third-roll banking, current Rules and 320/375/390-wide layouts.

`drop-browser.mjs` checks both carry cancellations, pending-placement continuity,
the nonqualifying pair-of-Jacks 5s row, the qualifying 500 board, bonus/hand audio
order, separate count ranges, final hold, automatic destination, saved-run
re-entry, one result row, timeout, abandonment and six layouts. Lobby screenshots
and computed styles distinguish Originals, with separate Rules hit targets.

`voyage-browser.mjs` checks all nine banks, qualification flights, three opening
bells, muted playback, final 9,900 total, automatic destination, saved-run
re-entry and one result row. Five viewport sizes pass. Pre-roll, rolling and
two-cargo screenshots were inspected for contrast and transparent deck visibility.

Eight installed hosted rollback suites pass for current/retained Horses and Drop
rules, authorization, replay/late replay, immutable results, recovery,
continuation, terminal states and zero financial/multiplayer writes. The new
`supabase/ptown-polish/smoke-acceptance-proof.sql`, composed with the guarded
activation script, also passes on hosted authority: fresh admission → actual
roll evaluator → 382/99/33 offers → matching banks → duplicate-bank rejection.
All synthetic users, runs, activation switches and random-source overrides roll
back. No schema migration is needed.

88 focused tests, TypeScript and production Vite build pass. The known 14
pre-existing full-suite failures remain separately queued; full-suite green is
not claimed. Evidence is under `qualification.local/horses-blitz/polish-browser`,
`qualification.local/drop357/browser-partial`, and
`qualification.local/ship-cap-voyage/browser`.

## Release and owner smoke

Checkpoint `ptown-smoke-followup-2026-11-08` identifies the release commit.
Its `-verified` annotated tag records the exact production deployment, public
manifest, publication signal and installed admission verification. After matching
publication, run `supabase/ptown-polish/activate.sql` with that SHA. New games use
Horses /4 and Drop /5; old games retain their frozen versions. The release gate
must not be reported complete until both enabled rulesets are read back.

Physical iPhone acceptance remains Jeremy's smoke: start fresh games; verify
the exact Horses notes and scoring, audible hold/release and mute, lobby outline
contrast/Rules taps, Voyage pre-roll/rolling/cargo contrast, both carry cancel
paths, separate ALL FILLED/hand tally and the automatic final destinations.
