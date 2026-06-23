-- Holm physical-provenance on player_cards:
--   * hand_context_id: immutable per-hand identity stamped at provisioning
--   * source_version : coherent hand-payload revision stamped IDENTICALLY on
--                      every row of one provisioning/update transaction
--                      (NOT a per-row counter). Monotonic for the tuple
--                      (player_id, round_id, hand_context_id).
ALTER TABLE public.player_cards
  ADD COLUMN IF NOT EXISTS hand_context_id text,
  ADD COLUMN IF NOT EXISTS source_version  bigint NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS player_cards_round_player_idx
  ON public.player_cards (round_id, player_id);

CREATE INDEX IF NOT EXISTS player_cards_hci_idx
  ON public.player_cards (hand_context_id)
  WHERE hand_context_id IS NOT NULL;
