import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * voice-to-text — Lovable AI Gateway Speech-to-Text.
 *
 * Now also writes durable server-side incident events into
 * public.voice_operation_events for every boundary. These events survive
 * sender-client death and are the primary forensic source.
 *
 * Body: { audio: base64, mimeType: string, voice_operation_id?: string }
 * Returns: { transcript: string }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

async function writeEdgeEvent(
  voice_operation_id: string | null | undefined,
  phase: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  if (!admin || !voice_operation_id) return;
  try {
    await admin.from("voice_operation_events").insert({
      voice_operation_id,
      origin: "edge",
      phase,
      status_code: (extras.status_code as number) ?? null,
      duration_ms: (extras.duration_ms as number) ?? null,
      byte_count: (extras.byte_count as number) ?? null,
      error_category: (extras.error_category as string) ?? null,
      error_message: (extras.error_message as string) ?? null,
      metadata: extras.metadata ?? {},
    });
  } catch { /* durability-best-effort */ }
}

async function patchIncident(
  voice_operation_id: string | null | undefined,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!admin || !voice_operation_id) return;
  try {
    await admin
      .from("voice_operation_incidents")
      .update(patch)
      .eq("voice_operation_id", voice_operation_id);
  } catch { /* noop */ }
}

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

  const t0 = Date.now();
  let voiceOpId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const { audio, mimeType, voice_operation_id } = body ?? {};
    voiceOpId = typeof voice_operation_id === "string" ? voice_operation_id : null;

    await writeEdgeEvent(voiceOpId, "EDGE_REQUEST_RECEIVED", {
      byte_count: typeof audio === "string" ? audio.length : 0,
      metadata: { mimeType: mimeType ?? null },
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await writeEdgeEvent(voiceOpId, "EDGE_REQUEST_FAILED", {
        status_code: 503,
        error_category: "not-configured",
        error_message: "voice-to-text capability not configured",
        duration_ms: Date.now() - t0,
      });
      await patchIncident(voiceOpId, {
        edge_function_last_phase: "EDGE_REQUEST_FAILED",
        edge_function_last_phase_at: new Date().toISOString(),
        edge_function_status_code: 503,
        edge_function_error_category: "not-configured",
        edge_function_error_message: "not configured",
      });
      return new Response(
        JSON.stringify({ error: "voice-to-text capability not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!audio || typeof audio !== "string") {
      await writeEdgeEvent(voiceOpId, "EDGE_REQUEST_FAILED", {
        status_code: 400,
        error_category: "validation",
        error_message: "missing audio payload",
        duration_ms: Date.now() - t0,
      });
      await patchIncident(voiceOpId, {
        edge_function_last_phase: "EDGE_REQUEST_FAILED",
        edge_function_last_phase_at: new Date().toISOString(),
        edge_function_status_code: 400,
        edge_function_error_category: "validation",
      });
      return new Response(
        JSON.stringify({ error: "Missing audio payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await writeEdgeEvent(voiceOpId, "EDGE_REQUEST_VALIDATED", {
      byte_count: audio.length,
    });

    const bytes = base64ToBytes(audio);
    const mt = typeof mimeType === "string" && mimeType ? mimeType.split(";")[0] : "audio/webm";
    const extMap: Record<string, string> = {
      "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3",
      "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg",
    };
    const ext = extMap[mt] ?? "webm";
    const file = new File([bytes], `chat.${ext}`, { type: mt });

    const form = new FormData();
    form.append("file", file);
    form.append("model", "openai/gpt-4o-mini-transcribe");

    await writeEdgeEvent(voiceOpId, "EDGE_TRANSCRIPTION_STARTED", {
      byte_count: bytes.byteLength,
      metadata: { mime: mt },
    });

    const tTrans = Date.now();
    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: form,
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => "");
      const status = upstream.status === 402 ? 402 : upstream.status === 429 ? 429 : 502;
      const errCategory = upstream.status === 402 ? "credits"
        : upstream.status === 429 ? "rate-limit" : "upstream-transcription";
      const errMsg = upstream.status === 402 ? "Out of Lovable AI credits."
        : upstream.status === 429 ? "Rate limited."
        : `Transcription failed (${upstream.status}).`;

      await writeEdgeEvent(voiceOpId, "EDGE_REQUEST_FAILED", {
        status_code: status,
        error_category: errCategory,
        error_message: errMsg,
        duration_ms: Date.now() - tTrans,
        metadata: { upstream_status: upstream.status, snippet: txt.slice(0, 256) },
      });
      await patchIncident(voiceOpId, {
        edge_function_last_phase: "EDGE_REQUEST_FAILED",
        edge_function_last_phase_at: new Date().toISOString(),
        edge_function_status_code: status,
        edge_function_error_category: errCategory,
        edge_function_error_message: errMsg,
      });
      return new Response(
        JSON.stringify({ error: errMsg, detail: txt.slice(0, 512) }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = await upstream.json();
    const transcript = typeof payload?.text === "string" ? payload.text : "";
    const transcriptionMs = Date.now() - tTrans;

    await writeEdgeEvent(voiceOpId, "EDGE_TRANSCRIPTION_COMPLETED", {
      status_code: 200,
      duration_ms: transcriptionMs,
      metadata: { transcript_length: transcript.length },
    });

    await writeEdgeEvent(voiceOpId, "EDGE_RESPONSE_SENT", {
      status_code: 200,
      duration_ms: Date.now() - t0,
      metadata: { transcript_length: transcript.length },
    });

    await patchIncident(voiceOpId, {
      edge_function_last_phase: "EDGE_RESPONSE_SENT",
      edge_function_last_phase_at: new Date().toISOString(),
      edge_function_status_code: 200,
    });

    return new Response(
      JSON.stringify({ transcript }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeEdgeEvent(voiceOpId, "EDGE_REQUEST_FAILED", {
      status_code: 500,
      error_category: "unhandled",
      error_message: message.slice(0, 500),
      duration_ms: Date.now() - t0,
    });
    await patchIncident(voiceOpId, {
      edge_function_last_phase: "EDGE_REQUEST_FAILED",
      edge_function_last_phase_at: new Date().toISOString(),
      edge_function_status_code: 500,
      edge_function_error_category: "unhandled",
      edge_function_error_message: message.slice(0, 500),
    });
    return new Response(
      JSON.stringify({ error: message || "voice-to-text error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
