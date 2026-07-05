/**
 * VoiceOperationPresenceMount — mounts inside /game/:gameId to keep the
 * server-visible presence heartbeat contextualized (game_id) and to run
 * the peer witness effect so this tab automatically writes witness rows
 * for other players' voice operations at the same table.
 *
 * No UI. No user interaction. Server-first: heartbeats and witness
 * records land regardless of whether the sender's tab survives.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { setVoicePresenceContext } from "@/lib/runtimeInstrumentation/voicePresenceHeartbeat";
import { useVoicePeerWitness } from "@/hooks/useVoicePeerWitness";

export const VoiceOperationPresenceMount = (): null => {
  const { gameId } = useParams<{ gameId: string }>();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setVoicePresenceContext({ game_id: gameId ?? null });
    return () => setVoicePresenceContext({ game_id: null });
  }, [gameId]);

  useVoicePeerWitness({ game_id: gameId ?? null, self_user_id: userId });

  return null;
};
