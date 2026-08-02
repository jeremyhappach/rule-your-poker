import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;

const mimeExtensions: Record<string, string> = {
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mpga",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { audio, mimeType } = body ?? {};
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openAiApiKey) {
      return jsonResponse({ error: "voice-to-text capability not configured." }, 503);
    }
    if (!audio || typeof audio !== "string") {
      return jsonResponse({ error: "Missing audio payload." }, 400);
    }

    const normalizedMime = typeof mimeType === "string" && mimeType
      ? mimeType.split(";")[0]
      : "audio/webm";
    const extension = mimeExtensions[normalizedMime];
    if (!extension) {
      return jsonResponse({ error: "Unsupported audio format." }, 415);
    }
    if (audio.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: "Audio recording exceeds the 25 MB limit." }, 413);
    }

    const bytes = base64ToBytes(audio);
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return jsonResponse({ error: "Audio recording exceeds the 25 MB limit." }, 413);
    }

    const form = new FormData();
    form.append(
      "file",
      new File([bytes], `chat.${extension}`, { type: normalizedMime }),
    );
    form.append("model", "gpt-transcribe");

    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiApiKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : upstream.status === 413 ? 413 : 502;
      const error = upstream.status === 429
        ? "Voice transcription is temporarily rate limited."
        : upstream.status === 413
          ? "Audio recording is too large."
          : "Voice transcription is temporarily unavailable.";
      console.error("OpenAI transcription failed", { upstreamStatus: upstream.status });
      return jsonResponse({ error }, status);
    }

    const payload = await upstream.json();
    const transcript = typeof payload?.text === "string" ? payload.text.trim() : "";
    return jsonResponse({ transcript }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("voice-to-text error", { message: message.slice(0, 500) });
    return jsonResponse({ error: "Voice transcription is temporarily unavailable." }, 500);
  }
});
