# P-Town Sound Lab

Phase 1 audition only. No production routes, game callers, financial code,
database state, existing audio manager or existing sound generators are edited.

From this worktree:

```powershell
bunx --no-install vite --config dev/sound-lab/vite.config.ts
```

Open http://localhost:4317 on this PC. On a phone on the same Wi-Fi, open
http://192.168.1.242:4317 while this server and PC remain running. The LAN address
can change; Vite prints the current network URL. No public hosting, tunnel,
firewall change or production deployment is configured. If the phone cannot
reach the PC, audition the WAV collection on desktop; physical-device access
has not been verified from this machine.

The page loads 21 portable WAVs once (~0.91 MB), then uses memory for playback.
No account or database connection is required. The real `GameplaySoundButton`,
`AudioManager` and playback-session helper run with a development-only local
preference adapter. The label explains that this is separate from the account
preference. Production uses the existing `platformAudio` singleton and
`profiles.play_sounds`; this prototype does not replace either.

Listen to each sample, compare the unchanged reference buttons, and star favorites.
Export shortlist downloads a local JSON file; it does not approve deployment.
Mute/Stop cancel current sound. Dice roll → landing demonstrates cancellation
and visual timing. Winner + 12 competing deals demonstrates priority suppression.
No sound plays on load, refresh or foreground restoration. Deliberately clicking
Listen again is a new audition. After a cold device start, explicit audition
clicks have a bounded one-second unlock allowance, and the visual starts at actual
audio scheduling. Automatic simulation events retain a short expiry.

The registry and single-voice priority/cooldown prototype live only in this folder.
They are an audition of future policy, not a second production audio engine.
Sample gain is baked into WAVs. One voice at a time prevents summation peaks in
this lab. Production-wide mixing/priority changes require the next scoped approval.

Validation (installed dependencies only):

```powershell
bunx --no-install tsc --noEmit -p dev/sound-lab/tsconfig.json
bunx --no-install vite build --config dev/sound-lab/vite.config.ts
node dev/sound-lab/verify.mjs
```

`verify.mjs` expects the lab server above and uses installed Edge. Its evidence is
under `qualification.local/sound-lab`, ignored by Git. The standalone build is
also there; the normal app build does not include this entry or its assets.
See [audit and proposed rollout](../../docs/codex/SOUND_EFFECTS_AUDITION.md) and
[provenance](licenses/SOURCES.md). Physical iOS/Android PWA, listening quality,
extended-session fatigue and real game synchronization remain acceptance work.
