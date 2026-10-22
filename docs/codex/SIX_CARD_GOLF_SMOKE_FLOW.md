# Golf smoke-flow candidate - October 22, 2026

LOCAL REVIEW ONLY. Publication, production migrations and admission changes are held.
Base: cb11f17d292ffbda8b067b2ee5bba5713a6ea8ce. Branch: codex/golf-smoke-flow.

## Diagnosed boundaries and local correction

- Blank MY slots: accepted replacement removed the pending-card source anchor while the old presentation hook hid the destination until transport retirement. The candidate retains that source and the occupied destination through incoming transport. The incoming face arrives first; a back then travels from the replaced position to discard and flips. Late callbacks are fenced by match/hole/revision/stage. Recovery seeks current state.
- Opening upcard: the authoritative public projection exposed it before all opening selections. The candidate redacts it during opening, including action responses. The standalone opening-visibility.candidate.sql was applied ONLY to the isolated loopback UI database. The historical production migration was not modified or reapplied.
- Canonical announcements: the shell provider is session-scoped; Golf emitted dealer-game IDs and gameplay notices used the wrong payload field. Golf now uses the session scope, distinct hole-qualified event IDs, and the canonical notice title. Winner events retain their existing text contract. No shared announcement owner changed.
- MY helper, canonical identity row and spotlight, disabled pile treatment, active-opponent-only felt tableau, inactive seat backs and public-only partial score pills are local candidate changes.
- Completed-hole scoring uses only the authoritative revealed result. Card/pair highlights, prior-card dimming, final-score beats and a Results table are driven from the authoritative deadline. A cold result mount/reconnect seeks to Results. No client advances play or delays server settlement.

## Separate timing proposal - selected for review, NOT approved

The current six-second result window cannot contain four two-second score holds plus counting. The current three-second final terminal window is also insufficient. No authoritative timing has changed.

Recommend a frozen result window of 7N + 2 seconds: 16 / 23 / 30 seconds for 2 / 3 / 4 participants. Budget per participant: 700 ms introduction, at most six 650 ms card beats (a cancelled column uses one pair beat), 2,000 ms final total, 180 ms clearing gap. That is at most 6.78N seconds; remaining time presents the Results table. Every two-second hold is preserved without compressing the beats.

If approved, the server must persist the result start and deadline at the atomic final-reveal boundary. Freeze the presentation configuration at admission; retain existing six-second behavior for admitted/historical configurations. Do not silently reinterpret current matches. The rule identity, points, legal actions and whole-turn allowance remain unchanged.

For hole nine, settlement remains immediate and atomic at earned completion. Add the same scoring window BEFORE the existing three-second winner/terminal hold, with persisted presentation boundaries. Winner presentation must begin after counting/results, rather than obscuring them. Recovery and close authorization use those persisted boundaries; no client acknowledgement gates finances or progression. Preserve canonical deliberate-pause handling and reconnect/ended-session routing.

This timing work requires separate approval, implementation and candidate/installed-authority lifecycle proofs. It is not implemented by the preview's browser projection interception. Current local live gameplay still fits its legacy deadlines; the readable preview is explicitly labelled a proposal and cannot qualify the new terminal schedule.

## Evidence actually executed

- Focused presentation, privacy, subtotal and scoring tests passed, including pending-anchor retention, outgoing back-only intents and stale-callback/reconnect rejection.
- Full validation passed: TypeScript, 2,713 application tests and 241 harness tests. One additional announcement-scope regression test subsequently passed in the focused suite.
- Local production build passed.
- All 63 rendered 2/3/4-player/viewer/viewport cases passed; shortest landscapes use a contained scrolling MY pane and a horizontal felt arrangement.
- Actual two-human browser play completed nine holes, settlement, Session Ended and cold reconnect with no card-audio replay.
- 2/3/4-human local RPC/browser checks proved opening redaction for every viewer, private pending draws, occupied MY slots throughout replacement, discard flip, one active opponent tableau, card-by-card scoring and reconnect seeking Results.
- Timestamped screenshots provide the scoring sequence because the local Playwright video dependency is unavailable. No dependencies were installed.

Review: http://127.0.0.1:5198/qualification.local/six-card-golf/smoke-review.html
Evidence: qualification.local/six-card-golf/{smoke-flow.json,layout.json,smoke-validate.log,polish-build.log,session-ended-browser.json}.

No production query, data mutation, migration, push, deployment or admission change occurred in this local smoke pass. Existing unrelated Cribbage snapshot work is preserved. Mixed-bot rendered smoke was not rerun in this pass. Manual owner review and production acceptance remain outstanding.

## Two-defect preview follow-up - October 22

Fresh render verification supersedes the previously inspected smoke-2-step-1.png and smoke-4-opponent.png. The main helper cleanup was already present, but a frame monitor reproduced one scoring frame with the Final turns announcement because passive-effect retirement ran after paint. Retirement and scoring publication now run before paint. A completed-hole warning could also appear in Info and is now suppressed there. A browser frame monitor starts before the final action and rejects any Final turns text on the scoring surface.

The current four-player render reproduced horizontal clipping: the right name row ended at x=406.20 and its back row at x=395.20 in a 390px surface. Chip anchors were within bounds. Golf now opts into the existing canonical inward name and outer-edge/inward card-row attachments. No chip anchor, seat ordering, timer, felt geometry or other game's defaults changed. The shared adapter only passes these existing canonical options through when requested.

Affected adapter consumers enumerated before modification: Golf, Gin Rummy, Cribbage, Yahtzee, Run21 and Farkle. Default preservation is tested for all five other consumers. Validation for this follow-up: 23 focused tests, TypeScript, and 63 rendered layouts including horizontal bounds for seat names, dealer pips, chip faces and card backs. Final fresh 2/3/4-player scoring sequences and transition monitoring are recorded separately under review-20261022-final.

The 16/23/30-second timing and ninth-hole schedule remain unapproved proposals. No production, migration, admission, live-session, commit or push action is part of this follow-up. The final review directory contains the exact source checkpoint manifest and fresh rendered evidence; it supersedes older preview frames.

## Running scoring subtotal and pair preview - October 22

The active-player pane now names the player being scored and displays that player's running subtotal for the current hole: Scoring Player 1/Hole 1: +4, then +10 after a six. Each introduction starts at zero. A matching vertical pair highlights both cards together and adds zero. The completed hand uses the authoritative recorded hole score; the running count never includes previous holes. This presentation starts only after all cards are publicly revealed at hole completion; no hidden values are used.

The review adds a discoverable Show pair cancellation control and a controlled public sample with 4/6, 9/9 and J/K columns. Its sequence is +4, +10, +10, +20, +20. Sample cards/names/scores are substituted only in the local browser projection and labelled as a presentation fixture, not database scoring or settlement evidence. Ordinary 2/3/4-player browser runs remain separate from this sample. No database cards/scores or result timing are changed by the sample.

The fresh review lives under qualification.local/six-card-golf/review-20261022-subtotal. All 18 focused scoring/helper tests and TypeScript pass. Fresh 2/3/4-player browser scoring runs pass, as does the controlled pair sequence with assertions for +4, +10, simultaneous pair highlighting, and unchanged +10. The review button, screenshot loading and previous-frame controls were verified in a browser; the pair frame was inspected visually. Broad layout/build/match checks listed above were not repeated for this text-only product change. The longer timing proposal and ninth-hole schedule remain held; no publication, production mutation or commit is authorized by this UI follow-up.

## Pending approval: configurable reveal/count/results sequence - October 22

Supersedes the earlier fixed 16/23/30-second proposal if approved. Defaults: Scoring Delay 1200 ms, Hole Results Duration 5000 ms; validated integer milliseconds, frozen with a supported presentation configuration at setup/admission. Changes apply to future matches. Preserve historical six-second configurations. Admission validation must validate the frozen supported configuration, not compare against mutable current defaults; changing defaults during Ante Up must not invalidate an existing offer.

For each player's scoring presentation, retain the positions still concealed after their final turn. Persist those pre-reveal exposure masks at authoritative hole completion before the existing all-cards-public transformation. Publish presentation metadata at the completion boundary. It is a display mask over already-authorized public values, never a change to legal reveal or score authority. Show that player's hand in its prior face/back arrangement, flip each previously concealed card individually for Scoring Delay (stable position order 0 through 5), then begin card/pair scoring. Fully exposed cards do not re-flip. Pair counting takes one Scoring Delay and adds zero. Reset the running hole subtotal per player; do not advance it during flips. Preserve current 700 ms introduction, 2000 ms final score hold and 180 ms inter-player clear.

At completion the server derives and persists the full presentation schedule: sum of introductions, actual hidden-card flip counts, actual card/pair beats, player total holds and clears, followed by exactly the configured Results duration. Total duration is independent of viewer-relative player ordering. Results starts after every hand finishes, has no X, and cannot be dismissed by Escape/outside click. The client seeks those boundaries; it does not compress the requested delay or own advancement. Late clients get the current presentation/results remainder, never a newly restarted timer; cold reconnect still skips replay. Deliberate pauses freeze applicable boundaries and resume shifts them consistently. Hole nine commits finances immediately, then presents reveal/count/results before the existing winner/terminal hold. Terminal close/continuation authorization must respect the new persisted deadline. No browser acknowledgement gates earned settlement or recovery.

Persistent FINAL TURN is a Golf artifact within the canonical felt, above the displayed cards, driven by playing phase plus the authoritative nonempty final queue. It is visible to every viewer and persists through pause/reconnect, ending exactly at hole completion. For prolonged-play final turns retain the house-rule explanation. Do not add a second announcement or lifecycle owner.

Golf should resolve names once through the shared bot-alias resolver, retaining durable ordinals and UUID identity, and format the requested Bot1/Bot2 labels consistently in seats, helper text, announcements, Info/history and Results. Never rename stored profiles or renumber from the viewer's rotation. Shared DialogContent may expose an opt-out for its close control with the default preserved for all other callers; apply it only to the Golf results surface.

Read-only deployed evidence agrees with the source: golf_rules defines holeResultSeconds=6; golf_reduce hardcodes +6000 and overwrites exposed flags before history; golf_settle starts +3000 terminal timing at settlement; golf_begin compares frozen rules against current golf_rules. No scoring/results columns exist in the deployed Golf defaults row. All five bot entries found in deployed Golf match rosters have storage suffixes; the Golf model forwards names without getBotAlias while Cribbage uses it. Current candidate golfScoreBeats uses 650 ms card beats, and golfScoreFrame compresses them to fit its legacy deadline. Current final-turn announcement expires after 2500 ms; the remaining helper notice is outside the requested felt position. Shared DialogContent always renders its close control.

Implementation qualification should cover defaults save/validation and frozen offers/matches; flip-before-count with mixed exposed/concealed cards and pairs; exact 1200/5000 ms boundaries without compression; all 2/3/4-player views and bot aliases; ordinary and prolonged final queues; pause/reconnect/zero-client recovery; ninth-hole atomic settlement, continuation and terminal ownership. Replay/late-replay and financial proofs must remain intact because presentation deadlines share those lifecycle owners. No implementation or production change was made for this new proposal.

## Approved and implemented locally: timing, reveal and card-motion package

Jeremy approved the preceding package and corrected outgoing-card visibility: only a concealed outgoing card travels as a back; an already-exposed card travels face up and does not flip. Stock/discard selection now enlarges the selected artifact by 22%. During incoming travel the old destination card offsets proportionally, and its own offset anchor supplies the outgoing flight. Occupied slots and private pending-source retention remain intact. Stale revisions and reconnect still clear transient motion.

The server persists pre-final-reveal masks plus scoring start, Results start and presentation end. Scoring/reveal delay defaults to 1200 ms (200-5000 ms allowed); Results defaults to 5000 ms (1000-30000 ms allowed). Values are validated, saved through existing Game Defaults, and frozen in a supported presentation configuration at setup. Changing defaults during Ante Up does not invalidate the offer. Legacy admitted six-second configurations remain supported. Base gameplay rule identity remains six-card-golf/1.

New live-flow clients use the persisted schedule without compression. Each hand retains its prior backs, flips those positions individually, then counts cards/pairs and updates its current-hole subtotal. Cold/reconnected clients seek the current schedule without replaying flip animations; the Results overlay opens only in its persisted interval. Pauses freeze flip presentation and shift all authoritative boundaries equally on resume. Hole-nine settlement remains immediate; winner presentation and close wait until Results finishes. The immutable-match guard permits only the exact presentation-time translation on a paused-to-resumed settled match; scores, cards, rules, identity and settlement stay immutable.

FINAL TURN is attached above the active felt tableau and replaces its optional partial-subtotal pill while final turns are active, preventing overlap on small surfaces. When the active player is the viewer, it remains on the felt above the piles. The helper and authoritative final queue remain unchanged. The visible label survives pauses/reconnect and retires at hole completion. Both ordinary and prolonged queues use it; prolonged play retains its house-rule explanation.

Validation actually completed: 59 focused tests (including defaults save/invalid-input handling, bot alias identity, preserved reveal masks, exact scoring/results boundaries, and outgoing face/back behavior); TypeScript; local production build; 63 rendered layouts; fresh 2/3/4-player interaction/scoring runs, with FINAL TURN non-overlap checks at 320px portrait and 844px landscape; a controlled paired-hand/reveal screenshot sequence; and a separate actual face-up discard-pickup/replacement browser run proving offset and no unwanted flip. Both candidate and installed-authority rollback suites pass core rules, six complete 2/3/4-human matches across both money modes, every tie count, real chip/ledger checks, injected financial failure rollback, replay/late replay after continuation, authorization, pause/recovery, frozen defaults/offers and new timing/reveal metadata. Synthetic proof records rolled back.

New local evidence: qualification.local/six-card-golf/review-20261022-timing-motion; presentation-candidate-proof.json; presentation-installed-proof.json; timing-indexes.json; timing-motion-build.log. Pair cards/names/masks are a clearly labelled browser-only presentation fixture, separate from authoritative ordinary-match proof. The preview buttons expose selected discard, destination offset, face-up outgoing, FINAL TURN, reveals and pair cancellation. No hosted concurrency rerun or production qualification is claimed; the prior full browser terminal run is historical, not a fresh terminal-render proof for these deadlines.

Local candidate installation used presentation.candidate.sql against loopback database golf_ui_1792616534787 only. Production and publication remain held. This supersedes the prior unapproved fixed 16/23/30-second timing proposal. Jeremy's review remains pending.
