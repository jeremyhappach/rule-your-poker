
1) **Reproduce + capture evidence**
   - Pull **browser console errors** and **network failures** from the run that ends in the blank screen.
   - The screenshot’s huge “diam/club/hearts” text strongly suggests **card-face images/SVGs failed to render** and you’re seeing **fallback text** (e.g., `<img alt>` or SVG `<text>`), so network/console will confirm 404s or invalid asset paths.

2) **Validate DB state for that exact hand**
   - Read the latest `games` row + latest `rounds` row(s) for your session using the **triple-key scope** (`dealer_game_id`, `hand_number`, `round_number`) and confirm:
     - `dealer_game_id` is non-null
     - `hand_number` increments only when expected
     - Holm uses `round_number = 1` consistently
     - the UI isn’t accidentally reading a stale round from another hand because of ordering/nulls or missing scope

3) **Trace the “solo vs Chucky” evaluation + announcement source**
   - Inspect the Holm showdown code path that generates:
     - winner name (should be your username)
     - hand description (should be derived from actual evaluated best hand)
   - If it’s showing the generic “Player beat Chucky!”, that usually means **the richer payload was missing/failed parsing**, or the evaluator errored and the UI fell back.

4) **Confirm the cards you saw were actually the cards in storage**
   - Compare what’s rendered in your “active player area” vs what’s in the persisted `player_cards` row for that round.
   - If they don’t match, that’s almost always **round mismatch** (UI bound to wrong round id) or **cards overwritten due to a bad round selector** after the hand/round increment refactor.

5) **Only after (1)-(4): implement the fix**
   - Fix will likely be one of:
     - a single incorrect “latest round” query (missing dealer_game_id scope / wrong ordering / NULLS)
     - a Holm-specific hand/round increment mismatch (writing `games.current_round` from a guessed value instead of DB-returned values)
     - a render path that builds card asset URLs from a suit/rank format that changed (breaking images and causing the fallback text overlay)
