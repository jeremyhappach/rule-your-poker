# Async presence, Words scales and result presentation — local review

2026-10-30. Owner authorized local implementation and interactive preview of
per-child playing presence/live cards and three shared Words scales, then added
Quintzee final bonus labels and hiding the bell inside async routes. Publication
remains explicitly held for visual review. No push, deployment, hosted migration,
customer repair, new credentials or money-mode expansion occurred.

## Preview

Run `node dev/async-combined/live-preview.mjs` from this checkout. The running
loopback preview is **http://127.0.0.1:15403/** on JeremyLaptop.

- Root opens the playable Words board directly. Exact full/medium/closest URLs
  are `/delayed/match/play/words?viewer=a&zoom=0&fresh=1` (use zoom 1 or 2).
- Open Alex's fresh board first, then `/delayed/match?viewer=b` in a **separate
  browser window**. Keep both visible side by side. Only the first child pulses.
  Backgrounding Alex's board intentionally stops presence. At closest scale,
  choose C and place on PT; choose A and place immediately right; choose T and
  Submit Word. Blair's first card changes to Your turn without refresh; the
  opponent score stays masked. Fresh links reset this shared synthetic match.
- Quintzee offers upper-only, fill-only, both and neither, for own results and
  opponent replay. Reload to repeat the scripted final count-up.
- `/scenarios` holds secondary checks. `/scenarios/bell?viewer=b` is explicitly
  a notification test screen, with a bounded 52×44 bell, not the product lobby.

The actual game views, canonical shells, delayed routes and notification provider
run with synthetic HTTP/SSE transport. The preview accepts fixture Words commands;
it is **not a rules, database settlement or hosted Realtime proof**. No production
account, session, credential or financial state is connected. The `/start` links
reset only this process's fixture match.

October 30 preview follow-up: laptop/phone entry, all three exact links and
single/double tap checks pass with screenshots inspected. Headed Edge confirms
two-window pulse on the exact child and submission/handoff without refresh.
The automated browser kept background tabs visible, so the hidden/visible hook
check explicitly simulates `document.hidden`; native tab occlusion is not proven.
The earlier owner's failed pulse check has no confirmed historical cause. The
server is reachable now; the previous same-window tab instructions were unsuitable
for a visible-board-only signal and are corrected. Evidence:
`owner-preview-entry.json`, `owner-pulse.json`, `owner-words-*.png` and
`owner-pulse-{visible,handoff}.png`. Only preview files/documentation changed;
product code and publication hold are unchanged.

## Ownership and behavior

`playingPresence.ts` owns ephemeral presence. Its private topic binds the permitted
match UUID, child UUID, current actor UUID and exact authoritative availability
deadline. The server policy authorizes both participants to read and only the
current actor to track. Unrelated users cannot subscribe or publish. No payload
identity or alias becomes authorization. The topic changes on handoff, including
returns to the same player; held, expired, removed and terminal matches are denied.

WordsTurn and DelayedTurn publish only on their visible playable board, outside
result/review presentation. Hiding, leaving, going offline or finishing retires the
channel. Per-connection presence keys preserve another active tab/device. Changed
heartbeat IDs renew a 35-second local lease; repeated snapshots do not. A ten-second
check bounds stale display to at most approximately 45 seconds on an active client.
Background clients clear immediately and reconnect/refetch on return. This is a
presence heartbeat, not gameplay polling. Reduced motion retains static accessible
“Playing now” text. Presence never writes gameplay, deadlines, scores or finances.

`Delayed.tsx` still loads permitted projections after `delayed_match_updates`,
reconnect, foreground and online events. Cards never infer handoff from presence.
List/child request generations now reject late replies; the existing home revision
guard remains. Completion updates cards in place, with no automatic navigation.
Existing unseen-score and private-rack projection owners remain unchanged.

Shared `PtownWordsView` now has full/medium/close states. Medium is halfway between
the container-fitted tile and the existing 48px closest tile. Full fit is capped at
the closest scale so it cannot become larger than close on a roomy desktop. When
the whole board already fits at 48px, additional zoom need not enlarge it.
At 390px the inspected cells measured approximately 24/36/48px.

All pointer board taps use the existing deferred tap gate. A single tap advances
one scale, capped at close; a double tap retreats one scale and cancels placement.
At full/medium, navigation takes precedence even with a selected tile. At close,
selected-tile placement and draft-tile removal work as before. Rack/HUD actions do
not zoom. Keyboard activation remains immediate. Touch drag cancels a pending tap;
the actual cell geometry owns hit testing, and resize preserves the visible center.
Directional third-tile placement, blanks, undo, recall, draft recovery and opponent
reveal camera restoration are retained. Only an accepted own word automatically
returns to full. No extra zoom buttons or second board were introduced.

`QuintzeeView` resolves `QuintzeeBonuses` at its existing final score count window
(immediately for reduced motion), using the revealed authoritative result. Achieved
labels are bold green; missed labels are red and struck through, with their helper
removed independently. Earned values come from the result/configuration. A filled
card with a configured zero bonus remains an achievement. All modes use this shared
view: Arcade, synchronous own/opponent, async own and saved opponent replay.
No eligibility, scoring, clock, manual Start/roll, review admission or hold changed.

`NotificationBellContent` returns null on `/delayed` and its child routes. The
provider, unread state, invitations and realtime subscriptions continue. Main
lobby, Arcade and synchronous tables retain their existing bell behavior.

## Security dependency and release hold

Read-only hosted inspection found no policies on `realtime.messages` and confirmed
the current private match/child/removal schema. The candidate
`supabase/delayed/playing-presence.candidate.sql` adds a narrowly scoped private
authorization helper plus Presence-only SELECT/INSERT policies. It does not grant
general access to private tables, Broadcast or arbitrary topics. Realtime caches
authorization for a channel connection; the topic's immutable actor/window binding
and current authoritative card eligibility prevent an old connection from indicating
play on a new turn. See [Supabase authorization documentation](https://supabase.com/docs/guides/realtime/authorization).

This is a **new scoped permission dependency**, prepared for review only. It is not
a registered or installed hosted migration. No new credentials are required. Before
publication, owner review must cover the visual candidate and this policy change;
the approved release phase must register/install it and verify the real authenticated
Realtime service with two accounts, unauthorized reads/tracks, reconnects and cached
old topics. No public-channel fallback is allowed. Client publication alone is not
qualification of secure presence. Existing production release remains unchanged.

## Validation and limits

- **PASS:** 3,296 source/server tests across 465 files; focused subset 99 cases.
- **PASS:** application TypeScript check and one production build using process-local
  loopback fixture settings; no environment files changed.
- **PASS:** eight rollback-contained local SQL/RLS checks: actor/participant/outsider/
  anonymous authorization, exact scope, actual SELECT/INSERT policy execution,
  handoff, child terminal, parent removal, settled parent and expiry. The older local
  fixture's global incident was closed within the rollback transaction, and its
  missing removal/Realtime policy tables were modeled there. All changes rolled back.
  This proves the candidate SQL predicates/RLS, not the hosted Realtime protocol.
- **PASS:** 17 real-view browser scenarios covering two-client presence/handoff,
  multi-device departure, masked score, three scales, double tap, placement/undo,
  pan/resize, desktop, reduced motion and eight Quintzee own/replay combinations.
- **PASS:** additional actual Chromium touch drag, 200% text/resize, and provider/
  bell route refresh checks. Screenshots were inspected; an initial preview-only
  Quintzee wrapper-height defect was corrected and the browser set rerun.
- **PASS:** full compiled App, no module aliases: phone/desktop cold and warm main
  bell → async list → lobby, direct entry and refresh; four round-game routes through
  saved review, handoff, playable board and reload, with no async bell flash. Explicit
  Quintzee Start remains one command and no automatic roll is sent.
- **NOT RUN:** real hosted private Realtime, production publication, customer gameplay,
  physical-device/Safari acceptance or new financial settlement proofs. Financial
  functions, synchronous rules, parent-only settlement, negative balances, 36-hour
  turns and 24-hour Last Call are unchanged.

Evidence is under ignored `qualification.local/async-combined/`: `live-aggregate.log`,
`live-focused.log`, `live-cards.log`, `live-build.log`, `playing-presence-proof.json`,
`live-browser.json`, `gesture-extra.json`, `bell-app-browser.json`,
`bell-games-browser.json`, `words-{full,medium,close}.png`, `words-large-text.png`
and `quintzee-*.png`. Owner visual approval and subsequent hosted qualification are
pending; local tests do not establish production acceptance.
