-- Replace only the production entropy source. The legacy function name and UUID
-- argument remain for caller compatibility; the UUID is not a seed.
CREATE OR REPLACE FUNCTION public.holm_deterministic_chucky_cards(p_round_id uuid, p_used_cards jsonb, p_card_count integer)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public'
AS $function$
  WITH deck AS (
    SELECT suit, rank
    FROM unnest(ARRAY[chr(9827), chr(9830), chr(9829), chr(9824)]) AS suits(suit)
    CROSS JOIN unnest(ARRAY['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) AS ranks(rank)
  ), available AS (
    SELECT
      jsonb_build_object('suit', suit, 'rank', rank) AS card,
      private.secure_shuffle_key() AS shuffle_key
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
$function$;

COMMENT ON FUNCTION public.holm_deterministic_chucky_cards(uuid,jsonb,integer) IS
'Legacy signature: draws Chucky cards with private cryptographic entropy. Round ID is not a seed. Existing authoritative cards are reused by the locked callers.';
