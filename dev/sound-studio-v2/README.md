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
