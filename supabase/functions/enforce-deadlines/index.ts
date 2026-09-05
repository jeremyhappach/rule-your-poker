// Retired. The database dispatcher owns deadlines and settlement.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    success: false,
    disabled: true,
    reason: 'legacy_enforcer_retired_use_canonical_game_owners',
  }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
