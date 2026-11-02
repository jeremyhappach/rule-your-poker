# Sound Lab provenance — November 1, 2026

All files in `assets/` are audition candidates, not approved gameplay sounds.
The per-file input and output SHA-256 hashes, input filename, author, source URL,
license, processing recipe, duration, sample peak and RMS are in `catalog.json`.
Selected original input files are retained in `sources/` for reproducibility.

| Material | Author / primary source | Permission and treatment |
|---|---|---|
| Cards, chips, dice | Kenney Vleugels, [Casino Audio 1.1](https://kenney.nl/assets/casino-audio) | CC0 1.0; commercial use, editing and redistribution allowed. Original included license is `kenney-casino.txt`. |
| Wooden peg candidates | Kenney, [Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds) | CC0 1.0; original included license is `kenney-impact.txt`. These are wooden impacts, not a recording specifically of a cribbage peg. |
| Recorded glass alternative | Joseph Sardin, [Glass Burst, sound 148](https://bigsoundbank.com/glass-burst-s0148.html), original `https://bigsoundbank.com/UPLOAD/bwf-en/0148.wav` | Source page identifies CC0 and allows commercial use, edits and redistribution. Source explicitly notes slight saturation; retain as an alternative, not a clean-master claim. Retrieved November 1, 2026. |
| Designed glass, three leg levels, mellow count-up, winners A/B/C, major victory | Original deterministic synthesis in `prepare.mjs`, composed for this task by Codex | No third-party recording, sampled instrument or borrowed melody. Project originals; no third-party attribution obligation. No claim of exclusive copyright in generated output. |
| Existing reference buttons | Existing repository generators, imported verbatim in `references.ts` | Unmodified project code. These are comparison references, not new recordings or replacements. |

[Kenney's own licensing FAQ](https://kenney.nl/support) confirms commercial use
and optional attribution. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
is the cited third-party dedication. No commercial music or unlicensed recordings
are included. Direct pack URLs found in old indexes now return HTML; acquisition
used each publisher page's normal download mechanism, not a mirror.

Processing: decode/downmix/resample to mono 32 kHz, trim leading silence, limit
length, remove DC, 3 ms entry / up to 35 ms exit fades, and scale to the deliberate
per-event peak tier. Export PCM16 WAV. Peak/RMS figures are signal measurements,
not LUFS or a listening judgment. Quiet outputs do not repair distortion already
present in a source recording. Raw sources are never played by the lab.

Regenerate with `node dev/sound-lab/prepare.mjs` using the existing Playwright and
installed Edge. This is a development preparation operation, not a runtime
dependency or a network fetch. All runtime candidates are local WAV files.
