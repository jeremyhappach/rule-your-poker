import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RELEASE_SETTING_KEY = "release_publication";
const MANIFEST_URL = Deno.env.get("RELEASE_MANIFEST_URL") ?? "https://holm357.com/build-manifest.json";
const RELEASE_PUBLICATION_TOKEN = Deno.env.get("RELEASE_PUBLICATION_TOKEN") ?? "";
const SHA_40 = /^[0-9a-f]{40}$/i;

interface ReleasePublishRequest {
  buildSha?: unknown;
  deploymentId?: unknown;
  publishedAt?: unknown;
}

interface BuildManifest {
  buildId?: unknown;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseReleasePublishRequest(rawBody: string): {
  deploymentId: string;
  publishedAt: string;
  buildSha: string;
} | null {
  let body: ReleasePublishRequest;
  try {
    body = JSON.parse(rawBody) as ReleasePublishRequest;
  } catch {
    return null;
  }

  if (typeof body.deploymentId !== "string" || !body.deploymentId) return null;
  if (typeof body.buildSha !== "string" || !SHA_40.test(body.buildSha)) return null;
  if (typeof body.publishedAt !== "string" || Number.isNaN(Date.parse(body.publishedAt))) return null;

  return {
    deploymentId: body.deploymentId,
    buildSha: body.buildSha.toLowerCase(),
    publishedAt: new Date(body.publishedAt).toISOString(),
  };
}

serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!RELEASE_PUBLICATION_TOKEN) {
    console.error("release publication token is not configured");
    return json({ error: "server_not_configured" }, 503);
  }

  const rawBody = await request.text();
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!constantTimeEquals(suppliedToken, RELEASE_PUBLICATION_TOKEN)) {
    return json({ error: "invalid_token" }, 403);
  }

  const releaseRequest = parseReleasePublishRequest(rawBody);
  if (!releaseRequest) return json({ error: "invalid_release_request" }, 400);

  let manifest: BuildManifest;
  try {
    const response = await fetch(MANIFEST_URL, {
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) return json({ error: "manifest_unavailable" }, 503);
    manifest = await response.json() as BuildManifest;
  } catch {
    return json({ error: "manifest_unavailable" }, 503);
  }

  if (
    typeof manifest.buildId !== "string" ||
    !SHA_40.test(manifest.buildId) ||
    manifest.buildId.toLowerCase() !== releaseRequest.buildSha
  ) {
    return json({ error: "manifest_invalid" }, 503);
  }

  const release = {
    schemaVersion: 1,
    buildSha: manifest.buildId.toLowerCase(),
    deploymentId: releaseRequest.deploymentId,
    publishedAt: releaseRequest.publishedAt,
  };
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // `updated_at < publishedAt` is the concurrency guard. A duplicate or late
  // workflow may not overwrite a newer public release, including a rollback.
  const { data: updated, error: updateError } = await admin
    .from("system_settings")
    .update({ value: release, updated_at: releaseRequest.publishedAt })
    .eq("key", RELEASE_SETTING_KEY)
    .lt("updated_at", releaseRequest.publishedAt)
    .select("updated_at")
    .maybeSingle();
  if (updateError) {
    console.error("release publication update failed", updateError.message);
    return json({ error: "release_update_failed" }, 503);
  }
  if (updated) return json({ accepted: true, release });

  const { data: current, error: currentError } = await admin
    .from("system_settings")
    .select("value, updated_at")
    .eq("key", RELEASE_SETTING_KEY)
    .maybeSingle();
  if (currentError || !current) {
    console.error("release publication row is missing", currentError?.message ?? "missing");
    return json({ error: "release_row_missing" }, 503);
  }

  return json({ accepted: false, release: current.value, updatedAt: current.updated_at });
});
