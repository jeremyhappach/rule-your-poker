# Five Alive presentation preview

From the repository root, run `node dev/five-alive/presentation/server.mjs`.

- Arcade: <http://127.0.0.1:5184/dev/five-alive/presentation/index.html?mode=arcade>
- Async A: <http://127.0.0.1:5184/dev/five-alive/presentation/index.html?mode=async&player=a>
- Async B: <http://127.0.0.1:5184/dev/five-alive/presentation/index.html?mode=async&player=b>

Submit STARE, then AMPLE to see sequential feedback and retained rows. Refresh
or Reconnect retains those guesses. APPLE solves the first word: all five tiles
finish before the base × difficulty calculation, its full five-second reading
interval, and the awarded total's flight/count into the score. In Async, each player
has their own guesses; Word results admits the opponent only after both finish.
The other fixture answers are BREAD and CRANE. Reset preview starts over.

This mounts the actual `FiveAliveSession`, board, CSS and award. A disposable
in-memory transport uses the existing shared rule primitives. It does not use
production, Supabase, accounts, balances or settlement. It is presentation
evidence, not a substitute for the preserved hosted qualification.

With the preview server running, execute
`node dev/five-alive/presentation/proof.mjs`. The fresh headless Edge context
blocks every nonlocal request and checks actual CSS animation events, all
three feedback statuses, two retained rows, refresh/reconnect, correct-guess
award ordering and five-second timing (including reconnect during the hold),
phone keyboard spacing/tap targets at 320, 390 and 430 px with a nonzero safe
area, Async privacy/mutual disclosure, and reduced motion. Evidence
and screenshots go to `qualification.local/five-alive/presentation/`.
