import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * voice-to-text — thin wrapper around ElevenLabs Speech-to-Text.
 *
 * Accepts { audio: base64, mimeType: string } and returns
 * { transcript: string }. Fails cleanly (503) when
 * ELEVENLABS_API_KEY is not configured so the match-chat mic can
 * surface an error state without blocking text chat.
 *
 * Raw audio is never persisted server-side; the request body is
 * discarded after the upstream call completes.
 */

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "voice-to-text capability not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { audio, mimeType } = await req.json().catch(() => ({ audio: null, mimeType: null }));
    if (!audio || typeof audio !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing audio payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bytes = base64ToBytes(audio);
    const mt = typeof mimeType === "string" && mimeType ? mimeType : "audio/webm";
    const ext = mt.includes("mp4") ? "mp4" : mt.includes("wav") ? "wav" : mt.includes("mpeg") ? "mp3" : "webm";
    const file = new File([bytes], `chat.${ext}`, { type: mt });

    const form = new FormData();
    form.append("file", file);
    form.append("model_id", "scribe_v2");

    const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: form,
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Transcription failed (${upstream.status}).`, detail: txt.slice(0, 512) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = await upstream.json();
    const transcript = typeof payload?.text === "string" ? payload.text : "";

    return new Response(
      JSON.stringify({ transcript }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message || "voice-to-text error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
