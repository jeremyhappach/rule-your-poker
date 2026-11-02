# Recorded heartbeat source

`andy-jack-heartbeat-pair.wav` is a 400 ms excerpt of a real resting heartbeat
recorded by Andy Jack and published by JonasTisell as **Heartbeat** on Freesound.
The source description identifies a real recording, with EQ used to remove noise.

- Source and author statement: https://freesound.org/people/JonasTisell/sounds/670465/
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Public high-quality preview: https://cdn.freesound.org/previews/670/670465_3910073-hq.mp3
- Retrieved: 2026-11-02
- Downloaded MP3 SHA-256: `1d5ec4cddbefdbcf3f64cf72ec3980c9f1a0de2b21cb40744ff05d9a282ae867`
- Committed excerpt SHA-256: `b3def8839e5e0a1624a65277fca5959e355cbabff03cb6bd244f17bd4115fa40`

The public preview was decoded with native Edge Web Audio at 32 kHz, stereo
channels averaged to mono, and quantized to PCM16. The committed excerpt keeps
frames 2,880–15,679 (0.090–0.490 seconds) from that decode: one complete lub-dub.
No pitch shifting, time stretching or generated tones are used.

`../prepare.cjs` reads this fixed PCM source, applies a 200 Hz high-pass and
a broad +12 dB presence adjustment at 450 Hz (Q 0.7), then 5/8 ms boundary fades
and a peak level of 0.38. This balances the recorded sound for computer speakers
without added tones or distortion. Both heartbeat candidates use this same pair.
Chucky's four-pair audition has a separate 760 ms rhythm against 950 ms card
flips; its final pair fades and ends at 2.68 seconds, before the final flip at
2.85 seconds. The runtime repeats the recorded pair using the canonical card
scheduler's actual cadence/deadline, and never cuts a pair to fit the final flip.
The unselected 357 heartbeat remains at 900 ms; Jeremy selected the beeps for 357.
DROP remains silent. These derivatives remain CC0.

The other two audition candidates remain original procedural sound designs.
