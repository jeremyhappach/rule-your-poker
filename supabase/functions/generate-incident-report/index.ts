// generate-incident-report — CONTAINED (emergency no-op).
//
// This function was proven runaway on 2026-07-07 (181 invocations /
// 20 min, 13s avg, 54s max, timing out on
// `client_runtime_events WHERE correlation_id = ...`), producing a
// 500/retry loop that saturated PostgREST/DB capacity and made game
// transitions take minutes.
//
// As a safety backstop it now returns an immediate successful
// disabled/no-op response without touching any of:
//   - client_runtime_events
//   - client_runtime_incident_reports
//   - client_runtime_incidents
//   - client_runtime_event_outbox
//   - debug_events
//   - any game or chat table
// It returns HTTP 200 so callers cannot retry on "error". Existing
// rows are preserved. To re-enable, restore from git history.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      disabled: true,
      reason:
        "incident-report pipeline is contained; function is a no-op backstop",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
