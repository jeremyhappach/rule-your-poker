# Consolidated Sound Pass 2 — November 2, 2026

Current isolated studio: 51 candidates in 17 categories (27 preserved, 24 new),
seven approved WAV references plus ten existing gameplay references. Real
Quintzee rumble and physical-dice renderers demonstrate the two roll families.
Use desktop http://localhost:4318/#rolling-demos or same-Wi-Fi iPhone
http://192.168.1.242:4318/#rolling-demos while this PC/server stays running.

Published main 5037d7fdf is included. New gameplay integration, push and production
publication remain held. See [full matrix / exact triggers / next sequence](../../docs/codex/SOUND_PASS2_COVERAGE.md).

Validation: studio typecheck/build; all 58 candidate/reference WAVs hash/format/
level/edge checks; native Edge playback of all 51 candidates and seven references;
favorites/export, replay, mute, receipt and interruption checks; native roll
checks for all six takes, exact stop-before-landing, four-held single-die landing,
all-held disabled, cancel/mute/pagehide with no late landing, descending displayed
900 ms countdown, silent reload; 1440/390/320/844-width layouts; desktop and phone
screenshots inspected. LAN responds HTTP 200 from host. 31 focused existing
Run21/Async/dice regressions pass. Physical iPhone/Android listening and PWA audio
sessions remain owner acceptance, not browser-emulation claims.

Commands (existing installed dependencies only):

```powershell
node dev/sound-studio-v2/prepare-pass2.mjs
node node_modules/typescript/bin/tsc --noEmit -p dev/sound-studio-v2/tsconfig.json
node node_modules/vite/bin/vite.js build --config dev/sound-studio-v2/vite.config.ts
node dev/sound-studio-v2/verify.mjs
node dev/sound-studio-v2/verify-pass2.mjs
```

The two verifiers expect the studio server on 4318. Evidence is ignored under
qualification.local/sound-studio-v2/. prepare-pass2 regenerates only the new
24 files. Never run prepare.mjs to revise approved selections inadvertently.

---

## Historical November 1 notes

# P-Town Sound Studio V2

Local-only independent audition. Branch `codex/sound-effects-pass2`, frozen
Sound Lab base `487f98df2`. The active Pass 1 worktree is untouched.

```powershell
bunx --no-install vite --config dev/sound-studio-v2/vite.config.ts
```

Open http://localhost:4318 on desktop or http://192.168.1.242:4318 on the same
Wi-Fi while this PC/server stays running. Vite prints the current LAN address.
Port 4318 is strict and separate from Pass 1. Physical iPhone reachability and
listening are pending; no firewall changes or public tunnels are configured.

27 new WAV candidates (three per category), seven exact approved Pass 1 WAVs,
replay, per-browser favorites/export, source/license notes, nominal peak/RMS,
listening attenuation, event notes and illustrative one-voice sequences.
The 27 new assets total 1,580,068 bytes. Assets load once into memory.
No audio on load/refresh, no account/API/database access, and no gameplay imports
of the development entry. The studio reuses the frozen central AudioManager
with an isolated local preference adapter and synthetic viewer identity.

Chucky candidates are original formant-synthesized character vocals, not voice
recordings. Future pre-deal identity is a documented integration gap. The
example is a timing concept, not an implemented Chucky animation or trigger.
The variable-leg controls are fictional inputs, never rule authority.

```powershell
node dev/sound-studio-v2/prepare.mjs
bunx --no-install tsc --noEmit -p dev/sound-studio-v2/tsconfig.json
bunx --no-install vite build --config dev/sound-studio-v2/vite.config.ts
node dev/sound-studio-v2/verify.mjs
```

Uses already installed dependencies/Edge; nothing to install. The verification
script expects the server on 4318. Build and screenshots go to the ignored
`qualification.local/sound-studio-v2/`. The audio checks exercise native Web
Audio scheduling, not just button state. See the verification JSON for observed
checks. Signal/functional checks do not replace subjective listening approval.

Qualification: isolated TypeScript and studio build pass. Browser checks pass
all 34 playback buttons, replay, stop, active mute, silent unmute/refresh,
favorites persistence/filter/export, exact event dedupe, automatic cooldown,
pending-sequence cancellation on pagehide and no catch-up on pageshow. Variable
target/local/opponent and sweep suppression checks pass. Four viewport sizes
fit; desktop and phone images were visually inspected. The LAN URL loads on
the host over its Wi-Fi address. No external/API/database requests were made
by the studio. Physical iPhone access, sound quality and fatigue remain pending.
Vite uses a worktree-local cache so concurrently running labs stay independent.

[Event audit](../../docs/codex/SOUND_STUDIO_V2.md) · [Provenance](SOURCES.md).

V2 release qualification uses an independent checkout on port 4328:

    bunx --no-install vite --config dev/sound-studio-v2/vite.config.ts --port 4328
    node dev/sound-studio-v2/verify-runtime.mjs

The runtime.html fixture imports the actual presentation components and approved
catalog, with the local audio adapter. The verifier blocks non-local requests.
Jeremy authorized the nine Take A selections for gameplay; see
../../docs/codex/SOUND_STUDIO_V2_INTEGRATION.md. Other takes remain audition-only.
