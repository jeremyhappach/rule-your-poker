# Async game latency audit — November 5, 2026

**Run21 needs immediate placement feedback. Take 2 is the one additional game in which a rapid, fully informed second move was lost.** Words has a separate, measurable extra round trip. Take 2, Quintzee and Boxdrop share the largest Async server cost: four serial database calls for an ordinary action, five with one previous result.

Audited published build `f2f81f3445e4e1210c4ba04d614a4bd27063cc43`. Jeremy reports that TriTowers feels better in user smoke. Its [previous audit](ASYNC_REVIEW_TRI_RESPONSIVENESS.md) is the reference, not a new phone measurement. This investigation made no product or production database changes.

## What was measured

48 controlled desktop Edge cases: six games × Async and its comparator × 180/600 ms per browser request × Sounds on/off. Touch viewport 390 × 844. The actual Async turn components and comparator views/hooks rendered deterministic projections. Arcade was the browser comparator for Run21, Take 2, Quintzee, Boxdrop and Mega; live was the comparator for Words. The Words live fixture used its real view/hook and reproduced the deployed transport's action-then-snapshot sequence. Other live paths were source comparisons, not additional timed multiplayer sessions.

Timings run from browser `pointerdown` to the first animation frame observing the indicated DOM change. **Pending** means visible feedback identifying the accepted input; disabling a button alone is reported separately. **Confirmed** means the first visual change derived from the command response, not the end of an animation. Disabled taps are not counted as confirmations of new commands. The first playable input was tested after any entry intro; Quintzee's explicit Ready Start was tested separately. Burst taps were about 100 ms apart. Runs included later, individually paced actions where appropriate.

The HTTP delay is per request, not per database call. Service measurements below are a separate experiment and should not be added to the browser timings. Audio used the application's Sounds preference and paths. There was no repeatable Sounds-dependent change in accepted inputs or number of requests in these cases. This small matrix is not a percentile benchmark, an acoustic test, a production timing trace, or physical iPhone PWA acceptance. Realtime update arrivals, cold starts, disconnects and deadline races were not simulated as part of the timings.

### Browser results

Milliseconds, observed ranges across Sounds on/off. Confirmed ranges cover the first and subsequent accepted commands specified below. The first-action column isolates the initial command at 600 ms.

| Game | Async explicit pending | Async first confirmed, 600 ms | Async confirmed, 180 / 600 ms | Comparator confirmed, 180 / 600 ms |
|---|---|---:|---:|---:|
| Run21 | None; Arcade showed tentative placement in 13–17 | 629–632 | 198–217 / 616–633 | 201–217 / 615–633 |
| Take 2 | 15–17 for first pair and later stock draws | 632–633 | 199–216 / 615–633 | 199–217 / 617–633 |
| Quintzee | None on Start/Roll/Score; local holds 15–17 | 629–633 | 198–217 / 618–633 | 200–216 / 616–634 |
| Boxdrop | Target marked in 12–16 | 631–632 | 197–215 / 631–632 | 196–216 / 630–632 |
| Words | Draft 13–16; submit 13–15 | 1,247–1,248 | 400–415 / 1,247–1,248 | 398–399 / 1,235 |
| Mega Card Golf | None on open/replace; controls disable in 9–16 | 630–631 | 194–216 / 618–632 | 199–233 / 615–637 |

### Consecutive actions, decisions and recommendations

**Run21.** In both modes, two of four burst placements were admitted at 180 ms and one at 600 ms. The next card had not been revealed for the suppressed taps. Four later, individually admitted placements accumulated 0.83–0.85 s of confirmation waits in Async at 180 ms and 2.50–2.53 s at 600 ms, excluding the driver's gaps. Arcade was essentially the same. The difference is what the player sees during each wait: Async disables controls in 11–17 ms with no placement marker; Arcade shows the already-known card in the selected column. **Recommend passing the existing tentative placement to the Async felt**, clearing it on acknowledgment, rejection, interruption or identity change. Do not advance the deck, score or clock, or queue choices for an unknown next card. The live view also uses the placement bridge.

**Take 2.** Four rapid card taps described two valid, disjoint, already-exposed tableau pairs. At 180 ms, Async submitted one pair and retained only the last card of the second; Arcade submitted both. At 600 ms, Async retained neither tap on the second pair (two retaps); Arcade retained its last card (one retap). The first pair showed “Confirming…” promptly in both. Three later stock draws accumulated 0.60–0.63 / 1.85 s of Async confirmation waits at 180 / 600 ms. There was no queue draining late: the missing second pair was never sent. The shared view distinguishes selection from submission, but Async sets its `view.canAct` false while a request is pending. Even where selection stays enabled, the second complete pair is not retained.

**Recommend restoring independent selection and retaining at most one further complete exposed tableau pair** in the shared interaction, behind a pending pair. Bind it to card identities, slots and round/segment; check exposure and legality again against the acknowledged projection; send only in order with a fresh command identity. A rejection, stale revision, uncertain recovery, actor/round change, or ended clock must not silently submit a dependent pair. Draw, current-card replacement and Take Score are decision boundaries. Apply the same interaction semantics to its Arcade/live consumers with their existing ownership checks.

**Quintzee.** Ready Start rolls the first five dice. Start, reroll and scoring had only disabled controls until the reply; after that, the configured/default 1,500 ms roll presentation ran. Ready → next decision took 1.72–1.73 / 2.13–2.16 s in Async at 180 / 600 ms and about 1.71 / 2.15 s in Arcade. Once settled, all three rapid holds registered in 15–17 ms each without any RPC. Ordinary score counting locks input for approximately another 600 ms after the reply; the upper bonus has a separate server-owned celebration boundary. The Arcade/live hook accepts the command response and then waits for another load before clearing pending. In Arcade the trace contained four actions and four follow-up reads; Async had four actions and no compulsory follow-up reads. The roll animation overlaps the reload in these tests, so removing the read does **not** imply a full extra response delay saved on every roll.

**Recommend an immediate Start/Roll/Score acknowledgment and using an accepted fresh command response without the unconditional Arcade/live reload.** Keep a fresh read for recovery, stale/replayed receipts, invalidations and rejection. Keep the dice, roll count, holds decision, score animation, upper-bonus deadline and clock under their existing owners. No roll queue or change to those animation durations is recommended.

**Boxdrop.** The target scale showed “Placing…” within a frame. Both modes admitted two of four burst taps at 180 ms and one at 600 ms: every additional placement requires the next server-issued box ID and value. All four later paced placements were accepted; Async accumulated 0.81–0.83 / 2.53 s of confirmation waits. No ordinary post-response animation lock was found. **Keep the interaction and current-box gate; shorten the server path.**

**Words.** Each mode staged three letters locally before a single submit. All eight final cases staged the complete word; the second Submit during the first request did not submit another turn. Both showed pending in roughly a frame. Async took about 0.40 / 1.25 s to show the committed board because both transports discard the action result and read a snapshot. Read-only inspection of the **deployed** action functions confirmed both return an authorized snapshot and can return a saved response on replay. **Consume the acknowledged fresh snapshot directly in Async and live.** Keep the existing identity/revision checks and recovery read when replay or an intervening revision requires current state. Leave word validation, tile visibility, score presentation and turn handoff intact. The removable cost is one client round trip; no post-fix time has been measured.

**Mega Card Golf.** Production Async and live admission are enabled. At 600 ms, the first opening reveal confirmed in about 0.63 s; the next opening decision became available in about 1.00 s in both modes. A hidden replacement made the next decision available in 2.78 / 3.18–3.20 s in Async at 180 / 600 ms, versus 2.97–3.02 / 3.83 s in Arcade. At 600 ms with Sounds on, Async dispatched the automatic draw 8 ms after the replacement response; Arcade dispatched it 2,220 ms after. Async overlapped this request with the reveal. The shared presentation still holds a hidden replacement for 2,200 ms and the stock reveal for 350 ms. A player must see the opened card or new draw before the next informed decision. **A target-specific pending indication is reasonable; no Async queue, shorter reveal, or earlier hidden-card disclosure is recommended.** Do not make Arcade copy an effect-order dependency to chase these numbers.

## Database and transport costs

Actual Async service and local PostgreSQL, synthetic actors and ordinary legal actions, rolled back. Injected 40 or 120 ms at each application-to-database RPC boundary. Times include local SQL and service work; they exclude browser transit and Auth. Each cell is elapsed service time in milliseconds for **three sequential actions**, at **40 / 120 ms per RPC**. The prior-result fixture measures projection cost, not a historical production match. The measured Async load, commit, Take 2 core and board core definitions matched hosted definition hashes.

| Game | Async DB calls/action, no / one prior own result | Three actions, no prior result | Three actions, one prior result | Comparator, ordinary successful command |
|---|---:|---:|---:|---|
| Run21 | 2 / 2 | 305 / 800 | 296 / 791 | Arcade: load + commit; one parallel profile read |
| Take 2 | 4 / 5 | 605 / 1,594 | 752 / 1,994 | Arcade: one step RPC |
| Quintzee | 4 / 5 | 601 / 1,563 | 747 / 1,963 | Arcade: action step + state step, each preceded by a profile read |
| Boxdrop | 4 / 5 | 602 / 1,598 | 741 / 1,978 | Arcade: one step RPC preceded by a profile read |
| Words | 2 client RPCs / same | One submitted turn; browser timing above | Not applicable | Live: action + snapshot, same as Async |
| Mega Card Golf | 2 / 2 by path inspection | 292 / 786 | Not timed for prior hole | Arcade: load + commit plus a preceding profile read; automatic draw is another command |

These are successful, uncontended gameplay paths. Vercel API routes also verify the user with Auth once per API request; Words uses authenticated PostgREST RPCs directly. Startup inspection/subscription, recovery, conflicts, clocks becoming due, terminal settlement and realtime catch-up are distinct paths. Arcade DB counts are traced from the published source and deployed step definitions, not timings against a production player. For Mega, the disposable fixture needed its v4 rules registration and admission supplied inside the rolled-back transaction; the invalid synthetic prior-hole case was excluded.

For Take 2, Quintzee and Boxdrop, the four calls are **load → SQL reducer → commit → visible projection**. Each prior own round requires another visible projection. With two prior rounds, those historical projections run in parallel with each other after the current projection: six calls, five serial stages. Run21 and Mega use their existing TypeScript rules between load and commit and project locally.

**Recommend a one-database-call path for ordinary Async Take 2, Quintzee and Boxdrop actions**, first Take 2, reusing the existing SQL rules, authorized visible projection, commit and receipt authorities. Keep original boundary handling unless equivalence is proved. Require same-version rules, replay/late replay, rejection, concurrency, deadline, hidden-information, terminal/settlement and rollback proofs before publishing each migration. Do not port Run21 or Mega rules to SQL to obtain the same call count. As a separate small Arcade correction, omit the unused sequential display-profile query for the qualified Quintzee, Boxdrop and Mega action/state paths; preserve authentication and RPC authorization.

### Evidence and approval

[Per-case measurements and database call traces](evidence/async-latency-20261105.json). The isolated browser/SQL harness and raw runs remain under `qualification.local/latency-audit/` in the audit worktree. No production sessions were created or mutated. There is no measured “after” for the recommendations and no physical iPhone validation in this report.

Suggested delivery order: (1) Run21 placement feedback and Take 2 pair retention; (2) eliminate the successful-path extra reads and add the Quintzee/Mega pending indications; (3) qualify the three Async database paths individually. Repeat the same first-action and burst matrix after implementation, then validate actual touch feel in the installed iPhone PWA.
