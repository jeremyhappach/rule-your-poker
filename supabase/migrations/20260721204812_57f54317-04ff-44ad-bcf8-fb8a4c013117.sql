UPDATE public.games SET status = 'session_ended', session_ended_at = COALESCE(session_ended_at, game_over_at, now()) WHERE id = '095b30c6-6a11-4c47-b58f-1093227d5cb9';
