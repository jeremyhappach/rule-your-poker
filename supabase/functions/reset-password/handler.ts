const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function retiredPasswordResetResponse(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  // Retirement must not parse identities, access service credentials, send
  // messages, or mutate an account. Auth.tsx owns token-based recovery.
  return new Response(JSON.stringify({
    error: "This endpoint is retired. Use Forgot password on the sign-in page.",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
