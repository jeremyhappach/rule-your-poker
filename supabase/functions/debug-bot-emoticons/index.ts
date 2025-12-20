import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMOTICONS = ["😂", "🔥", "👀", "🎯", "🚀", "🎲", "💀", "😎", "⭐", "🤡"]; 

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const keyToUse = serviceRoleKey || anonKey;

    if (!supabaseUrl || !keyToUse) {
      console.error("[DEBUG_BOT_EMOTES] Missing env vars", {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceRoleKey,
        hasAnonKey: !!anonKey,
      });
      return new Response(JSON.stringify({ error: "Backend not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const gameId = body?.gameId || body?.game_id;
    const requestedPlayerId = body?.playerId || body?.player_id;

    if (!gameId) {
      return new Response(JSON.stringify({ error: "gameId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let playerId: string | null = requestedPlayerId ?? null;

    if (!playerId) {
      const { data: bots, error: botsError } = await supabase
        .from("players")
        .select("id")
        .eq("game_id", gameId)
        .eq("is_bot", true);

      if (botsError) {
        console.error("[DEBUG_BOT_EMOTES] Failed to load bots", botsError);
        return new Response(JSON.stringify({ error: "Failed to load bots" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!bots || bots.length === 0) {
        return new Response(JSON.stringify({ error: "No bots in game" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      playerId = bots[Math.floor(Math.random() * bots.length)].id;
    }

    const emoticon = EMOTICONS[Math.floor(Math.random() * EMOTICONS.length)];
    const expiresAt = new Date(Date.now() + 4000).toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("chip_stack_emoticons")
      .insert({
        game_id: gameId,
        player_id: playerId,
        emoticon,
        expires_at: expiresAt,
      })
      .select("id, game_id, player_id, emoticon, expires_at")
      .single();

    if (insertError) {
      console.error("[DEBUG_BOT_EMOTES] Insert failed", insertError);
      return new Response(JSON.stringify({ error: "Insert failed", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[DEBUG_BOT_EMOTES] Inserted", inserted);

    return new Response(JSON.stringify({ success: true, row: inserted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[DEBUG_BOT_EMOTES] Unhandled error", err);
    return new Response(JSON.stringify({ error: "Unhandled error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
