# Quintzee roll timing — local review only, 2026-10-26

The owner can tune Quintzee presentation duration in Geometry Lab. Default remains **1500 ms**; bounds are 300–2500 ms in 50 ms steps. Motion amplitude, frozen gameplay versions, RNG, deadlines, scoring, settlement and existing celebration/count-up audio are unchanged. Quintzee currently has no separate roll sound; this change does not introduce one or retime score audio.

## Review and tuning

Open http://127.0.0.1:15298/dev/quintzee/production.html?user=a7bcbc7d-c48a-41f7-8112-9b459eea5441&mode=pregame on JeremyLaptop. Choose Classic Mode if wanted, then use **Geometry Lab** at top right before Play. Set **Roll duration (milliseconds)**, click **Apply Changes**, close the panel, then Play and Start. Try 750 or 1000 ms. The local preview saves only in this browser and performs no hosted settings write.

The application location is **Settings → Geometry Lab → Shell / Global → Quintzee Roll Timing**. It uses the established global registry and modal-wide draft/Apply/Cancel flow. Reset stages 1500 ms; Apply persists it. Cancel and closing discard unapplied drafts. Normal application persistence will use the existing admin-controlled system_settings flow when eventually published; that hosted write has not been exercised or authorized in this local pass.

A duration change affects the next roll. An active roll retains its original duration, held dice remain stationary, and one rumble boundary controls pip reveal and input unlock. Reconnect never replays the old roll. Opening Lab does not pause gameplay or extend deadlines.

## Browser timing

One measured Start and one held-die reroll for each theme/setting, actual Arcade service and PostgreSQL authority over loopback, Edge mobile viewport 390×844. These are local observations, not production latency estimates. Request/body includes server processing; the authority column is a subset measured by local-only Server-Timing. Body-to-rumble includes response consumption and rendering. Landing is the DOM reveal boundary; visible refresh is frame-quantized. No extra landing transition or sound timer exists.

All figures below are milliseconds.

| Theme | Setting | Action | Click → request | Request → body | Authority subset | Body → rumble | Rumble → reveal | Reveal → usable | Click → usable |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| modern | 1500 | Start | 1.3 | 94.4 | 90.9 | 3.1 | 1508.7 | 0.0 | 1607.5 |
| modern | 1500 | Reroll | 2.8 | 107.4 | 102.2 | 5.5 | 1511.2 | 0.0 | 1626.9 |
| modern | 750 | Start | 4.0 | 103.9 | 97.2 | 8.6 | 760.6 | 0.2 | 877.3 |
| modern | 750 | Reroll | 2.4 | 106.2 | 100.5 | 6.5 | 761.6 | 0.0 | 876.7 |
| classic | 1500 | Start | 4.2 | 98.5 | 92.8 | 11.8 | 1499.7 | 0.0 | 1614.2 |
| classic | 1500 | Reroll | 2.6 | 112.6 | 105.6 | 5.5 | 1505.9 | 0.0 | 1626.6 |
| classic | 750 | Start | 3.4 | 106.9 | 101.0 | 7.0 | 758.9 | 0.1 | 876.3 |
| classic | 750 | Reroll | 2.9 | 102.6 | 96.5 | 5.9 | 751.0 | 0.1 | 862.5 |

At default, total perceived delay was 1608–1627 ms; at 750 ms it was 863–877 ms. This identifies the additional request/render time without hiding it in the animation setting. Final faces and category actions remained concealed/locked during rumble; held-die CSS animation was none. Startup had only its 30-second timer; gameplay timer appeared on accepted Start, before landing.

## Validation and scope

- 28 focused tests passed, 0 failed, 0 skipped: rumble duration and mid-roll setting changes, bounds/defaults, modal Apply/Cancel/Reset and rejected save, snapshot/action continuity, category/Confirm 0 behavior and existing scoring/run-back checks.
- Eight browser timing paths passed; both themes/default and faster settings, remembered tuning after reload, Cancel, staged Reset then Apply, held dice, concealment/action locks, startup/gameplay timer visibility and no replay after reconnect.
- Application TypeScript and production build passed (existing Browserslist-age and chunk-size warnings only).
- No authority code or SQL changed. Prior rollback/financial proofs were not rerun for this presentation-only control. No production browser timing or hosted settings save was run.
- Evidence: [raw timings](../../dev/quintzee/evidence/roll-tuning/timing.json), [timing panel](../../dev/quintzee/evidence/roll-tuning/lab-owner.png), and ready-state images in that directory. The reusable runner is dev/quintzee/roll-tuning-browser.mjs.
- Local branch: codex/quintzee-polish-local; parent candidate bc009b06ee3a5c79154ab37cdb52e1823a7f7089. Commit containing this document is the timing candidate.

Publication remains explicitly held: no push, merge, production migration, deploy or activation. Take Score semantics remain an independent unanswered owner question; no new terminal rule was added. Unrelated Cribbage snapshot, old validation evidence and the named evidence stash are preserved.
