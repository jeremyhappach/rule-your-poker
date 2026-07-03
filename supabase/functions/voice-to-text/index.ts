import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * voice-to-text — Lovable AI Gateway Speech-to-Text.
 *
 * Accepts { audio: base64, mimeType: string } and returns
 * { transcript: string }. Uses openai/gpt-4o-mini-transcribe via
 * the Lovable AI Gateway. Billed from workspace Lovable credits.
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
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
    const mt = typeof mimeType === "string" && mimeType ? mimeType.split(";")[0] : "audio/webm";
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
    };
    const ext = extMap[mt] ?? "webm";
    const file = new File([bytes], `chat.${ext}`, { type: mt });

    const form = new FormData();
    form.append("file", file);
    form.append("model", "openai/gpt-4o-mini-transcribe");

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: form,
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => "");
      const status = upstream.status === 402 ? 402 : upstream.status === 429 ? 429 : 502;
      const errMsg =
        upstream.status === 402 ? "Out of Lovable AI credits. Add credits in Settings → Plans & credits."
        : upstream.status === 429 ? "Rate limited. Please try again in a moment."
        : `Transcription failed (${upstream.status}).`;
      return new Response(
        JSON.stringify({ error: errMsg, detail: txt.slice(0, 512) }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
