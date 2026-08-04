-- Use code points instead of pasted suit glyphs. The original SQL migration
-- stored mojibake suit strings, which broke the canonical card contract.
CREATE OR REPLACE FUNCTION public.holm_deterministic_chucky_cards(
  p_round_id uuid,
  p_used_cards jsonb,
  p_card_count integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH deck AS (
    SELECT suit, rank
    FROM unnest(ARRAY[chr(9827), chr(9830), chr(9829), chr(9824)]) AS suits(suit)
    CROSS JOIN unnest(ARRAY['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) AS ranks(rank)
  ), available AS (
    SELECT
      jsonb_build_object('suit', suit, 'rank', rank) AS card,
      md5(p_round_id::text || ':holm-chucky:' || suit || ':' || rank) AS shuffle_key
    FROM deck
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_used_cards, '[]'::jsonb)) AS used(card)
      WHERE lower(coalesce(used.card->>'suit', used.card->>'Suit')) = deck.suit
        AND upper(coalesce(used.card->>'rank', used.card->>'Rank')) = upper(deck.rank)
    )
    ORDER BY shuffle_key
    LIMIT p_card_count
  )
  SELECT coalesce(jsonb_agg(card ORDER BY shuffle_key), '[]'::jsonb)
  FROM available;
$$;
