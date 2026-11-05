# Selected invalid-play and bust sounds — 2026-11-05

Jeremy selected B for both inline auditions and required Run21's crumble to
coincide with its existing rock visual, replacing the current tone. This selection
authorizes the normal implementation/release flow. No new sound-design choice
remains; physical-device acceptance is pending.

## Exact owner and correction

TriTowers' shared board previously disabled rank-mismatched and covered cards,
so there was no attempted-tap handler. During an actionable turn those taps now
play the selected short low buzz and return without dispatching a move. Empty
stock attempts do likewise. The existing shared `adjacent` rule checks the
current or ordered pending upcard; valid buffered sequences continue normally.
Duplicate pending-card taps stay silent. Paused, disconnected, inactive-tab,
replay, intro and non-player-turn controls remain unavailable and silent.
Arcade, Async and live multiplayer use this same board. No network-error beep
or audio on snapshot arrival was added.

Run21's shared `useRun21FailureAudio` and `Run21Felt` observe the same confirmed
result. The hook now selects the exact Heavy crumble B sample only when the
visible outcome is `bust`. This replaces the old two-note failure sound; it does
not layer over it. Timeout, no-qualify and historical positive-score outcomes
keep their existing behavior. Arcade, Async and live callers retain the same
admission, result identity, dedupe, authoritative hold and interruption guards.
No animation, rules, scoring, clocks, settlement or schema change.

Both exact audition WAVs are preloaded through `approvedSounds`; source SHA-256
hashes match `src/assets/audio/NOTICE.txt`. Loading never blocks a tap or visual.
The crumble retains the 80 ms late-unlock cutoff and fits the existing 1,100 ms
failure window. The preview's 25 ms leading pad and entire waveform are preserved.
Global Sounds owns immediate mute/cancellation. No new audio manager or preference.

## Validation and release

- 269 focused tests / 27 files pass, including pending/rejected Async actions,
  shared TriTowers scenes, sound policy, recovery, all Run21 failure kinds and
  saved-review safeguards. New assertions cover exact cue choice, one cue per
  invalid attempt, pending-chain legality, unavailable/silent surfaces, no old
  oscillator on a bust, late-onset rejection and immediate mute.
- App TypeScript and Vite production build pass. Existing chunk-size and
  Browserslist-age warnings remain; no dependency/tool installation.
- Actual Edge Web Audio plus the real shared Run21 visual/hook measured sample
  scheduling 3.2–3.4 ms after the visible rock's DOM commit for three scope types.
  One selected sample and zero old sawtooth tones played on each bust. Timeout
  retained its two tones. Rerender, muted result, unmute and fresh result mount
  did not duplicate playback. This is browser scheduling evidence, not measured
  physical speaker latency or live production-session testing.
- Actual shared TriTowers browser clicks confirm one selected B buzz, no invalid
  dispatch, valid dispatch preserved and silence while muted.

Reproduce with `node dev/sound-feedback/browser.mjs`. Isolated browser transport
uses no production data; evidence is in `qualification.local/sound-feedback/`.
Audition source, historical catalog and approved selection are in
`dev/sound-feedback/`. Owner smoke: try legal/illegal and rapid queued cards with
Sounds on/off; bust Run21 and verify the crumble accompanies the rock with no
old tone; verify a timeout retains its original sound.

Checkpoint: `release-invalid-play-bust-audio-20261105`; the matching `-verified`
annotated tag records the exact published SHA/deployment. The earlier iPhone PWA
TriTowers missing bell/fanfare issue stays OPEN pending a device trace.
